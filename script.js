import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ==========================================
// 1. PRODUCT DATABASE & STATE MANAGEMENT
// ==========================================

const DEFAULT_PRODUCTS = [
  { id: 'rice-case', name: 'Case of Basmati Rice', sku: 'RC-101', category: 'Rice', length: 12, width: 10, height: 8, weight: 40, fragile: false },
  { id: 'oil-case', name: 'Case of Cooking Oil', sku: 'OL-202', category: 'Oil', length: 14, width: 14, height: 12, weight: 35, fragile: false },
  { id: 'bisc-case', name: 'Case of Butter Biscuits', sku: 'BS-303', category: 'Biscuits', length: 18, width: 12, height: 10, weight: 8, fragile: true },
  { id: 'soda-box', name: 'Box of Soda Cans', sku: 'SD-404', category: 'Beverages', length: 16, width: 12, height: 6, weight: 28, fragile: false },
  { id: 'chip-box', name: 'Box of Potato Chips', sku: 'CH-505', category: 'Snacks', length: 20, width: 16, height: 12, weight: 5, fragile: true }
];

let products = [];
let currentOrder = [];
let packedResult = {
  placed: [],
  unplaced: [],
  stats: {
    volumeUtil: 0,
    totalWeight: 0,
    maxHeight: 0,
    totalCount: 0,
    packedCount: 0
  }
};

// LocalStorage Hydration
function initState() {
  const storedProducts = localStorage.getItem('pallet_flow_products');
  if (storedProducts) {
    products = JSON.parse(storedProducts);
  } else {
    products = [...DEFAULT_PRODUCTS];
    localStorage.setItem('pallet_flow_products', JSON.stringify(products));
  }
  
  const storedOrder = localStorage.getItem('pallet_flow_order');
  if (storedOrder) {
    currentOrder = JSON.parse(storedOrder);
  } else {
    currentOrder = [];
  }
}

function saveProducts() {
  localStorage.setItem('pallet_flow_products', JSON.stringify(products));
}

function saveOrder() {
  localStorage.setItem('pallet_flow_order', JSON.stringify(currentOrder));
}

// ==========================================
// 2. PALLET OPTIMIZATION / PACKING ALGORITHM
// ==========================================

const PALLET_W = 48; // X axis
const PALLET_L = 40; // Z axis
const MAX_HEIGHT = 55; // Y axis
const MAX_WEIGHT_LIMIT = 2800; // lbs

/**
 * Run the 3D Bin Packing Algorithm
 */
function runPackingOptimizer() {
  // 1. Expand the order into individual items to pack
  let itemsToPack = [];
  currentOrder.forEach(orderItem => {
    const prod = products.find(p => p.id === orderItem.productId);
    if (!prod) return;
    for (let i = 0; i < orderItem.quantity; i++) {
      itemsToPack.push({
        id: `${prod.id}_${i}`,
        name: prod.name,
        sku: prod.sku,
        category: prod.category,
        length: prod.length,
        width: prod.width,
        height: prod.height,
        weight: prod.weight,
        fragile: prod.fragile
      });
    }
  });

  if (itemsToPack.length === 0) {
    packedResult = { placed: [], unplaced: [], stats: { volumeUtil: 0, totalWeight: 0, maxHeight: 0, totalCount: 0, packedCount: 0 } };
    return packedResult;
  }

  // 2. Sort the items:
  // - Non-fragile first, Fragile last.
  // - Within each group, sort by weight in descending order (heaviest first).
  // - Tie-breaker: larger volume first.
  itemsToPack.sort((a, b) => {
    if (a.fragile !== b.fragile) {
      return a.fragile ? 1 : -1; // false comes before true (non-fragile first)
    }
    if (b.weight !== a.weight) {
      return b.weight - a.weight; // heavy first
    }
    const volA = a.length * a.width * a.height;
    const volB = b.length * b.width * b.height;
    return volB - volA; // larger volume first
  });

  const placedBoxes = [];
  const unplacedBoxes = [];
  let currentTotalWeight = 0;

  // Extreme points coordinates for candidate search: (x, z)
  let extremePoints = [{ x: 0, z: 0 }];

  // Helper: check rectangle overlap in X-Z plane
  function checkOverlapXZ(x1, z1, w1, l1, x2, z2, w2, l2) {
    const margin = 0.01; // small margin to prevent floating point alignment bugs
    return (x1 + margin < x2 + w2 && x1 + w1 - margin > x2 &&
            z1 + margin < z2 + l2 && z1 + l1 - margin > z2);
  }

  // Helper: check if box is supported physically
  function checkSupportRatio(px, pz, w, l, y, placedBoxes) {
    if (y === 0) return 1.0; // Supported by the floor
    
    let supportArea = 0;
    const boxArea = w * l;
    
    // Find all boxes directly below this height
    placedBoxes.forEach(b => {
      // Check if box top matches the candidate Y coordinate
      if (Math.abs((b.y + b.h) - y) < 0.02) {
        if (checkOverlapXZ(px, pz, w, l, b.x, b.z, b.w, b.l)) {
          // Calculate intersection area
          const ix = Math.max(0, Math.min(px + w, b.x + b.w) - Math.max(px, b.x));
          const iz = Math.max(0, Math.min(pz + l, b.z + b.l) - Math.max(pz, b.z));
          supportArea += ix * iz;
        }
      }
    });

    return supportArea / boxArea;
  }

  // Loop through each box and pack it
  itemsToPack.forEach(box => {
    // Check weight limit first
    if (currentTotalWeight + box.weight > MAX_WEIGHT_LIMIT) {
      unplacedBoxes.push(box);
      return;
    }

    let bestPlacement = null;
    let bestScore = Infinity; // Lower score is better

    // Try all extreme points
    extremePoints.forEach(point => {
      // Try both standard and 90-deg rotated orientations in X-Z plane
      const orientations = [
        { w: box.width, l: box.length }, // Standard
        { w: box.length, l: box.width }  // Rotated
      ];

      // If dimensions are equal, only test one orientation
      const uniqueOrientations = box.width === box.length ? [orientations[0]] : orientations;

      uniqueOrientations.forEach(orient => {
        const { w, l } = orient;
        const h = box.height;

        // Check if fits within pallet boundaries
        if (point.x + w > PALLET_W || point.z + l > PALLET_L) {
          return;
        }

        // Calculate the height 'y' it would rest at
        let restY = 0;
        placedBoxes.forEach(b => {
          if (checkOverlapXZ(point.x, point.z, w, l, b.x, b.z, b.w, b.l)) {
            restY = Math.max(restY, b.y + b.h);
          }
        });

        // Check height limit
        if (restY + h > MAX_HEIGHT) {
          return;
        }

        // Check Fragile Constraint:
        // Ensure we are not stacking on top of any fragile box.
        let stacksOnFragile = false;
        placedBoxes.forEach(b => {
          if (b.fragile && Math.abs((b.y + b.h) - restY) < 0.02) {
            if (checkOverlapXZ(point.x, point.z, w, l, b.x, b.z, b.w, b.l)) {
              stacksOnFragile = true;
            }
          }
        });

        if (stacksOnFragile) {
          return; // Reject stacking on fragile items
        }

        // Check physical support ratio (must be at least 70% supported)
        const supportRatio = checkSupportRatio(point.x, point.z, w, l, restY, placedBoxes);
        if (supportRatio < 0.70) {
          return; // Reject if not stable
        }

        // Calculate placement score:
        // Primary: minimize height (y) to keep center of gravity low.
        // Secondary: minimize depth (z) to pack from back to front.
        // Tertiary: minimize width (x) to pack from left to right.
        const score = restY * 1000000 + point.z * 1000 + point.x;

        if (score < bestScore) {
          bestScore = score;
          bestPlacement = {
            x: point.x,
            y: restY,
            z: point.z,
            w: w,
            l: l,
            h: h,
            rotated: w === box.length
          };
        }
      });
    });

    if (bestPlacement) {
      // Place the box
      const placedBox = {
        ...box,
        x: bestPlacement.x,
        y: bestPlacement.y,
        z: bestPlacement.z,
        w: bestPlacement.w,
        l: bestPlacement.l,
        h: bestPlacement.h,
        rotated: bestPlacement.rotated
      };
      placedBoxes.push(placedBox);
      currentTotalWeight += box.weight;

      // Add new candidate extreme points
      extremePoints.push({ x: bestPlacement.x + bestPlacement.w, z: bestPlacement.z });
      extremePoints.push({ x: bestPlacement.x, z: bestPlacement.z + bestPlacement.l });
      extremePoints.push({ x: 0, z: bestPlacement.z + bestPlacement.l });
      extremePoints.push({ x: bestPlacement.x + bestPlacement.w, z: 0 });

      // Deduplicate and filter out-of-bounds extreme points
      const uniquePoints = [];
      const seen = new Set();
      extremePoints.forEach(pt => {
        const rx = Math.round(pt.x * 100) / 100;
        const rz = Math.round(pt.z * 100) / 100;
        if (rx < PALLET_W && rz < PALLET_L) {
          const key = `${rx},${rz}`;
          if (!seen.has(key)) {
            seen.add(key);
            uniquePoints.push({ x: rx, z: rz });
          }
        }
      });
      extremePoints = uniquePoints;
    } else {
      unplacedBoxes.push(box);
    }
  });

  // Calculate statistics
  let totalPackedVolume = 0;
  placedBoxes.forEach(b => {
    totalPackedVolume += b.w * b.l * b.h;
  });
  
  const totalBuildVolume = PALLET_W * PALLET_L * MAX_HEIGHT; // 48 * 40 * 55 = 105,600 cubic inches
  const volumeUtil = (totalPackedVolume / totalBuildVolume) * 100;
  
  let maxHeight = 0;
  placedBoxes.forEach(b => {
    maxHeight = Math.max(maxHeight, b.y + b.h);
  });

  packedResult = {
    placed: placedBoxes,
    unplaced: unplacedBoxes,
    stats: {
      volumeUtil: parseFloat(volumeUtil.toFixed(1)),
      totalWeight: currentTotalWeight,
      maxHeight: parseFloat(maxHeight.toFixed(1)),
      totalCount: itemsToPack.length,
      packedCount: placedBoxes.length
    }
  };

  return packedResult;
}

// ==========================================
// 3. THREE.JS 3D VISUALIZATION DECK
// ==========================================

let scene, camera, renderer, controls;
let palletGroup, boxesGroup;
let gridHelper;
let raycaster, mouse;
let boxMeshMap = new Map(); // Maps placedBox ID to Three.js Mesh

// Animation state
let currentTimelineStep = 0;
let isAnimating = false;
let animationTimer = null;
let explodedViewActive = false;
let gridVisible = true;

const CATEGORY_COLORS = {
  Rice: 0xef4444,      // Red
  Oil: 0xf97316,       // Orange
  Biscuits: 0xeab308,  // Yellow (Fragile)
  Beverages: 0x3b82f6, // Blue
  Snacks: 0x10b981,    // Green
  Other: 0x8b5cf6      // Violet
};

function getBoxColor(box) {
  if (box.fragile) return 0xeab308; // Fragile gets yellow color to stand out
  return CATEGORY_COLORS[box.category] || 0x64748b;
}

/**
 * Initialize 3D Canvas
 */
function init3D() {
  const container = document.getElementById('canvas-container');
  if (!container) return;

  const width = container.clientWidth;
  const height = container.clientHeight;

  // Scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a14);
  scene.fog = new THREE.FogExp2(0x0a0a14, 0.007);

  // Camera
  camera = new THREE.PerspectiveCamera(45, width / height, 1, 1000);
  // Default camera angle looking down at the pallet
  camera.position.set(70, 50, 75);

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  // Controls
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.maxPolarAngle = Math.PI / 2 - 0.05; // Prevent camera going under floor
  controls.minDistance = 20;
  controls.maxDistance = 250;
  // Center controls around the pallet workspace
  controls.target.set(PALLET_W / 2, MAX_HEIGHT / 4, PALLET_L / 2);
  controls.update();

  // Lights
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(60, 100, 40);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 2048;
  dirLight.shadow.mapSize.height = 2048;
  dirLight.shadow.camera.near = 0.5;
  dirLight.shadow.camera.far = 250;
  const d = 50;
  dirLight.shadow.camera.left = -d;
  dirLight.shadow.camera.right = d;
  dirLight.shadow.camera.top = d;
  dirLight.shadow.camera.bottom = -d;
  dirLight.shadow.bias = -0.0005;
  scene.add(dirLight);

  // Subtle accent point light to give high-tech blue glow to bottom
  const blueLight = new THREE.PointLight(0x6366f1, 1, 100);
  blueLight.position.set(PALLET_W / 2, -10, PALLET_L / 2);
  scene.add(blueLight);

  // Floor grid helper representing the warehouse floor
  const floorGrid = new THREE.GridHelper(300, 60, 0x1e1b4b, 0x0f172a);
  floorGrid.position.y = -5.5; // Sit exactly below the pallet bottom
  scene.add(floorGrid);

  // Pallet & Boxes Groups
  palletGroup = new THREE.Group();
  scene.add(palletGroup);

  boxesGroup = new THREE.Group();
  scene.add(boxesGroup);

  // Build the Wooden Pallet Model
  buildWoodenPallet();

  // Build Build-Volume Guide Wireframe Box (48x40x55)
  buildVolumeGrid();

  // Mouse Raycaster
  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();
  
  // Event Listeners
  window.addEventListener('resize', onWindowResize);
  container.addEventListener('mousemove', onCanvasMouseMove);

  // Start Render Loop
  animate();
}

/**
 * Builds a detailed 3D Wooden Pallet mesh
 */
function buildWoodenPallet() {
  const woodColor = 0x826242;
  const woodMaterial = new THREE.MeshStandardMaterial({
    color: woodColor,
    roughness: 0.9,
    metalness: 0.05
  });

  const boardThickness = 0.75;
  
  // 1. Top Deck Boards (7 boards running widthwise along Z)
  // Pallet Width is Z (40"), Length is X (48")
  // Board size: X=5.5", Y=0.75", Z=40"
  const topBoardGeom = new THREE.BoxGeometry(5.5, boardThickness, PALLET_L);
  const xPositions = [2.75, 9.83, 16.91, 24.0, 31.09, 38.17, 45.25]; // spaced across 48"
  
  xPositions.forEach(x => {
    const board = new THREE.Mesh(topBoardGeom, woodMaterial);
    board.position.set(x, -boardThickness / 2, PALLET_L / 2);
    board.castShadow = true;
    board.receiveShadow = true;
    palletGroup.add(board);
  });

  // 2. Stringer Blocks (3 blocks running lengthwise along X)
  // Block size: X=48", Y=3.5", Z=3.5"
  const stringerGeom = new THREE.BoxGeometry(PALLET_W, 3.5, 3.5);
  const zPositions = [1.75, PALLET_L / 2, PALLET_L - 1.75]; // Left, Middle, Right stringers

  zPositions.forEach(z => {
    const stringer = new THREE.Mesh(stringerGeom, woodMaterial);
    stringer.position.set(PALLET_W / 2, -boardThickness - 1.75, z);
    stringer.castShadow = true;
    stringer.receiveShadow = true;
    palletGroup.add(stringer);
  });

  // 3. Bottom Deck Boards (3 boards running widthwise along Z)
  // Board size: X=5.5", Y=0.75", Z=40"
  const bottomBoardGeom = new THREE.BoxGeometry(5.5, boardThickness, PALLET_L);
  const bottomXPositions = [2.75, PALLET_W / 2, PALLET_W - 2.75];

  bottomXPositions.forEach(x => {
    const board = new THREE.Mesh(bottomBoardGeom, woodMaterial);
    board.position.set(x, -boardThickness - 3.5 - boardThickness / 2, PALLET_L / 2);
    board.castShadow = true;
    board.receiveShadow = true;
    palletGroup.add(board);
  });
}

/**
 * Builds the wireframe build volume limits (48"x40" base, 55" height)
 */
function buildVolumeGrid() {
  const geom = new THREE.BoxGeometry(PALLET_W, MAX_HEIGHT, PALLET_L);
  const edges = new THREE.EdgesGeometry(geom);
  
  const mat = new THREE.LineBasicMaterial({
    color: 0x6366f1, // Indigo highlight
    transparent: true,
    opacity: 0.15
  });
  
  gridHelper = new THREE.LineSegments(edges, mat);
  // Center wireframe on deck
  gridHelper.position.set(PALLET_W / 2, MAX_HEIGHT / 2, PALLET_L / 2);
  scene.add(gridHelper);
}

/**
 * Canvas Resize Handler
 */
function onWindowResize() {
  const container = document.getElementById('canvas-container');
  if (!container) return;
  
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
}

/**
 * Dynamic canvas shipping label texture generator
 */
function createBoxLabelTexture(name, category, sizeText) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Shipping barcode simulation
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(20, 15, canvas.width - 40, 20); // Top banner
  
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 11px Outfit, sans-serif';
  ctx.fillText("PALLETFLOW LOGISTICS", 35, 29);

  // Barcode stripes
  ctx.fillStyle = '#000000';
  let barX = 25;
  while (barX < canvas.width - 25) {
    const barW = Math.floor(Math.random() * 4) + 1;
    ctx.fillRect(barX, 45, barW, 25);
    barX += barW + Math.floor(Math.random() * 3) + 1;
  }

  // Label text details
  ctx.fillStyle = '#1e293b';
  ctx.font = 'bold 12px Outfit, sans-serif';
  ctx.fillText(name.substring(0, 24), 20, 90);
  
  ctx.font = '10px Outfit, sans-serif';
  ctx.fillText(`Category: ${category}`, 20, 106);
  ctx.fillText(`Dims: ${sizeText}`, 20, 118);

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

/**
 * Build a 3D box model representing a product packaging box
 */
function createBoxMesh(placedBox) {
  const w = placedBox.w;
  const l = placedBox.l;
  const h = placedBox.h;

  const color = getBoxColor(placedBox);

  // Materials: 6 sides
  // We want standard category color on 5 sides, and a shipping label on the top face
  const labelTex = createBoxLabelTexture(placedBox.name, placedBox.category, `${placedBox.length}"x${placedBox.width}"x${placedBox.height}"`);
  
  const sideMat = new THREE.MeshStandardMaterial({
    color: color,
    roughness: 0.8,
    metalness: 0.1,
    transparent: true,
    opacity: 0.90
  });

  const labelMat = new THREE.MeshStandardMaterial({
    map: labelTex,
    roughness: 0.6,
    metalness: 0.05
  });

  // Material array: [x+, x-, y+, y-, z+, z-]
  // Top face is index 2 (y+)
  const materials = [sideMat, sideMat, labelMat, sideMat, sideMat, sideMat];

  const geom = new THREE.BoxGeometry(w, h, l);
  const mesh = new THREE.Mesh(geom, materials);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  // Add sharp outline edges so boxes don't mesh together visually
  const edges = new THREE.EdgesGeometry(geom);
  // Highlight fragile lines with glowing amber/orange edges
  const edgeColor = placedBox.fragile ? 0xf59e0b : 0x1e293b;
  const lineMat = new THREE.LineBasicMaterial({
    color: edgeColor,
    linewidth: placedBox.fragile ? 3 : 1
  });
  const line = new THREE.LineSegments(edges, lineMat);
  mesh.add(line);

  // Store original target coordinates in userData for physics updates
  mesh.userData = {
    id: placedBox.id,
    targetX: placedBox.x + w / 2,
    targetY: placedBox.y + h / 2,
    targetZ: placedBox.z + l / 2,
    w: w,
    l: l,
    h: h,
    productInfo: placedBox,
    isNew: true, // triggers drop animation
    currentYSource: placedBox.y + h / 2 + 30 // Start height for falling animation
  };

  // Initial drop state
  mesh.position.set(
    mesh.userData.targetX,
    mesh.userData.currentYSource,
    mesh.userData.targetZ
  );

  return mesh;
}

/**
 * Regenerate / Refresh boxes in Three.js based on timeline step
 */
function refreshTimelineVisuals() {
  // Clear existing box meshes from group
  while (boxesGroup.children.length > 0) {
    const mesh = boxesGroup.children[0];
    mesh.geometry.dispose();
    if (Array.isArray(mesh.material)) {
      mesh.material.forEach(m => m.dispose());
    } else {
      mesh.material.dispose();
    }
    boxesGroup.remove(mesh);
  }
  
  boxMeshMap.clear();

  // Populate first N items up to current timeline step
  const activePlacements = packedResult.placed.slice(0, currentTimelineStep);
  activePlacements.forEach((placedBox, index) => {
    const mesh = createBoxMesh(placedBox);
    
    // If it's already on the pallet, set it as already settled unless it's the absolute newest
    if (index < currentTimelineStep - 1) {
      mesh.userData.isNew = false;
      mesh.position.y = mesh.userData.targetY;
    }

    boxesGroup.add(mesh);
    boxMeshMap.set(placedBox.id, mesh);
  });

  // Update DOM step elements
  document.getElementById('current-step-num').textContent = currentTimelineStep;
  document.getElementById('stack-timeline-slider').value = currentTimelineStep;

  if (currentTimelineStep > 0 && currentTimelineStep <= packedResult.placed.length) {
    const lastPlaced = packedResult.placed[currentTimelineStep - 1];
    document.getElementById('step-action-desc').innerHTML = `Placed <span class="text-brand-400 font-bold">${lastPlaced.name}</span> (${lastPlaced.weight} lbs)`;
  } else {
    document.getElementById('step-action-desc').textContent = currentTimelineStep === 0 ? "Ready to load base layer" : "Pallet fully loaded!";
  }

  // Update navigation buttons disable state
  document.getElementById('anim-prev-btn').disabled = currentTimelineStep <= 0;
  document.getElementById('anim-next-btn').disabled = currentTimelineStep >= packedResult.placed.length;
}

/**
 * Handle Exploded View updates
 */
function updateExplodedPositions() {
  const explodedScale = 0.2; // expansion spacing
  
  boxesGroup.children.forEach(mesh => {
    const tx = mesh.userData.targetX;
    const ty = mesh.userData.targetY;
    const tz = mesh.userData.targetZ;

    if (explodedViewActive) {
      // Push boxes radially outwards from the pallet center
      mesh.userData.destX = tx + (tx - PALLET_W / 2) * explodedScale;
      mesh.userData.destY = ty + ty * (explodedScale * 1.5); // Push up higher
      mesh.userData.destZ = tz + (tz - PALLET_L / 2) * explodedScale;
    } else {
      mesh.userData.destX = tx;
      mesh.userData.destY = ty;
      mesh.userData.destZ = tz;
    }
  });
}

/**
 * Render/Animation Frame Update
 */
function animate() {
  requestAnimationFrame(animate);

  // Lerp positions for falling animations & exploded views
  boxesGroup.children.forEach(mesh => {
    // 1. Handle X and Z movement (for rotation or exploded view adjustments)
    const targetX = mesh.userData.destX !== undefined ? mesh.userData.destX : mesh.userData.targetX;
    const targetZ = mesh.userData.destZ !== undefined ? mesh.userData.destZ : mesh.userData.targetZ;
    
    mesh.position.x += (targetX - mesh.position.x) * 0.15;
    mesh.position.z += (targetZ - mesh.position.z) * 0.15;

    // 2. Handle Y movement (falling physics)
    let destY = mesh.userData.destY !== undefined ? mesh.userData.destY : mesh.userData.targetY;
    
    if (mesh.userData.isNew) {
      // Animate falling from currentYSource down to targetY
      mesh.userData.currentYSource += (destY - mesh.userData.currentYSource) * 0.18;
      mesh.position.y = mesh.userData.currentYSource;

      // Close enough to settle
      if (Math.abs(mesh.userData.currentYSource - destY) < 0.05) {
        mesh.userData.isNew = false;
        mesh.position.y = destY;
      }
    } else {
      mesh.position.y += (destY - mesh.position.y) * 0.15;
    }
  });

  // Update OrbitControls
  controls.update();

  // Render Scene
  renderer.render(scene, camera);
}

// ==========================================
// 4. RAYCASTER / TOOLTIP INTERACTIVES
// ==========================================

let highlightedMesh = null;
let originalMaterials = null;

function onCanvasMouseMove(event) {
  const container = document.getElementById('canvas-container');
  const tooltip = document.getElementById('canvas-tooltip');
  if (!container || !tooltip) return;

  const rect = container.getBoundingClientRect();
  
  // Calculate relative normalized coordinates (-1 to +1)
  mouse.x = ((event.clientX - rect.left) / container.clientWidth) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / container.clientHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(boxesGroup.children);

  if (intersects.length > 0) {
    const mesh = intersects[0].object;

    if (highlightedMesh !== mesh) {
      // Reset previous highlight
      resetHighlight();

      highlightedMesh = mesh;
      
      // Store original colors to restore later
      originalMaterials = mesh.material.map(m => m.clone());

      // Apply glowing highlight overlay to sides
      mesh.material.forEach((mat, idx) => {
        // Don't fully overwrite label top with color so details remain visible
        if (idx === 2) {
          mat.color.setHex(0xffffff);
          mat.emissive.setHex(0x1e1b4b);
        } else {
          mat.color.setHex(0x6366f1); // Indigo glow
          mat.emissive.setHex(0x312e81);
        }
      });
      
      // Populate tooltip contents
      const data = mesh.userData.productInfo;
      tooltip.innerHTML = `
        <div class="font-bold text-slate-100 flex items-center justify-between gap-2 border-b border-slate-800 pb-1 mb-1">
          <span>${data.name}</span>
          ${data.fragile ? '<span class="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 text-[8px] font-extrabold uppercase border border-amber-500/30">FRAGILE</span>' : ''}
        </div>
        <div class="grid grid-cols-2 gap-x-2 gap-y-0.5">
          <span class="text-slate-500">SKU:</span> <span class="text-slate-300 font-medium text-right">${data.sku}</span>
          <span class="text-slate-500">Weight:</span> <span class="text-slate-300 font-medium text-right">${data.weight} lbs</span>
          <span class="text-slate-500">Box Size:</span> <span class="text-slate-300 font-medium text-right">${mesh.userData.w}" × ${mesh.userData.l}" × ${mesh.userData.h}"</span>
          <span class="text-slate-500">Stack Pos:</span> <span class="text-slate-400 font-mono text-right">(${data.x.toFixed(0)}, ${data.y.toFixed(0)}, ${data.z.toFixed(0)})</span>
        </div>
      `;
      tooltip.classList.add('active');
    }

    // Move tooltip near cursor
    tooltip.style.left = `${event.clientX - rect.left + 15}px`;
    tooltip.style.top = `${event.clientY - rect.top + 15}px`;
  } else {
    resetHighlight();
    tooltip.classList.remove('active');
  }
}

function resetHighlight() {
  if (highlightedMesh && originalMaterials) {
    highlightedMesh.material.forEach((mat, idx) => {
      mat.color.copy(originalMaterials[idx].color);
      mat.emissive.copy(originalMaterials[idx].emissive);
    });
    highlightedMesh = null;
    originalMaterials = null;
  }
}

// ==========================================
// 5. UI BINDINGS & CONTROLLER ACTIONS
// ==========================================

function updateStatisticsUI() {
  const stats = packedResult.stats;
  
  // Progress calculations
  document.getElementById('stats-volume-util').textContent = `${stats.volumeUtil}%`;
  document.getElementById('stats-volume-progress').style.width = `${Math.min(stats.volumeUtil, 100)}%`;
  
  document.getElementById('stats-weight').textContent = `${stats.totalWeight} lbs`;
  const weightPercent = (stats.totalWeight / MAX_WEIGHT_LIMIT) * 100;
  document.getElementById('stats-weight-progress').style.width = `${Math.min(weightPercent, 100)}%`;
  
  document.getElementById('stats-height').textContent = `${stats.maxHeight}"`;
  const heightPercent = (stats.maxHeight / MAX_HEIGHT) * 100;
  document.getElementById('stats-height-progress').style.width = `${Math.min(heightPercent, 100)}%`;
  
  document.getElementById('stats-boxes').textContent = `${stats.packedCount} / ${stats.totalCount}`;
  const boxesPercent = stats.totalCount > 0 ? (stats.packedCount / stats.totalCount) * 100 : 0;
  document.getElementById('stats-boxes-progress').style.width = `${boxesPercent}%`;

  // Update visualizer status bar
  const indicator = document.getElementById('status-indicator');
  const statusTxt = document.getElementById('status-text');

  if (stats.totalCount === 0) {
    indicator.className = "w-2.5 h-2.5 rounded-full bg-slate-500 pulse-soft";
    statusTxt.textContent = "Empty Order";
  } else if (stats.packedCount === stats.totalCount) {
    indicator.className = "w-2.5 h-2.5 rounded-full bg-emerald-500 pulse-soft";
    statusTxt.textContent = "Pallet Fully Packed!";
  } else {
    indicator.className = "w-2.5 h-2.5 rounded-full bg-amber-500 pulse-soft";
    statusTxt.textContent = `Partial Load (${stats.packedCount}/${stats.totalCount} packed)`;
  }
}

function renderProductDatabase() {
  const dbContainer = document.getElementById('product-db-list');
  const searchVal = document.getElementById('db-search').value.toLowerCase();
  
  dbContainer.innerHTML = '';
  
  const filtered = products.filter(p => 
    p.name.toLowerCase().includes(searchVal) || 
    p.sku.toLowerCase().includes(searchVal) ||
    p.category.toLowerCase().includes(searchVal)
  );

  filtered.forEach(p => {
    const isDefault = DEFAULT_PRODUCTS.some(dp => dp.id === p.id);
    
    const card = document.createElement('div');
    card.className = "glass-panel rounded-xl p-3 border border-slate-800 hover:border-slate-700 transition flex items-center justify-between gap-2 shadow-sm";
    card.innerHTML = `
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-1.5">
          <h3 class="text-xs font-bold text-slate-200 truncate">${p.name}</h3>
          ${p.fragile ? '<span class="text-[8px] bg-amber-500/10 text-amber-400 px-1 rounded border border-amber-500/20 font-bold shrink-0">FRAGILE</span>' : ''}
        </div>
        <p class="text-[10px] text-slate-400 mt-0.5">SKU: ${p.sku} | Dims: ${p.length}"x${p.width}"x${p.height}"</p>
        <p class="text-[10px] text-brand-400 font-semibold mt-0.5">${p.weight} lbs • ${p.category}</p>
      </div>
      <div class="flex items-center gap-1 shrink-0">
        <button class="add-to-order-btn p-1.5 bg-slate-900 border border-slate-800 hover:bg-brand-600 hover:text-white rounded-lg text-slate-300 transition" 
                data-id="${p.id}" title="Add to Pallet Order">
          <i data-lucide="plus" class="w-3.5 h-3.5"></i>
        </button>
        ${!isDefault ? `
          <button class="delete-prod-btn p-1.5 bg-slate-900 border border-slate-800 hover:bg-red-950/20 hover:text-red-300 hover:border-red-900/50 rounded-lg text-slate-500 transition" 
                  data-id="${p.id}" title="Delete product">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          </button>
        ` : ''}
      </div>
    `;
    dbContainer.appendChild(card);
  });

  // Re-init icons inside dynamic HTML
  lucide.createIcons();

  // Attach button events
  dbContainer.querySelectorAll('.add-to-order-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const prodId = btn.getAttribute('data-id');
      addProductToOrder(prodId);
    });
  });

  dbContainer.querySelectorAll('.delete-prod-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const prodId = btn.getAttribute('data-id');
      deleteProductFromDb(prodId);
    });
  });
}

function renderOrderItemsList() {
  const container = document.getElementById('order-items-list');
  const emptyState = document.getElementById('empty-order-state');
  const countLabel = document.getElementById('order-count');

  if (currentOrder.length === 0) {
    container.innerHTML = '';
    container.appendChild(emptyState);
    countLabel.textContent = "0 Items";
    return;
  }

  // Remove empty state
  if (emptyState.parentNode === container) {
    container.innerHTML = '';
  } else {
    container.innerHTML = '';
  }

  let totalItems = 0;

  currentOrder.forEach(item => {
    const p = products.find(prod => prod.id === item.productId);
    if (!p) return;
    
    totalItems += item.quantity;

    const row = document.createElement('div');
    row.className = "glass-panel rounded-xl p-3 border border-slate-800 hover:border-slate-700 flex items-center justify-between gap-3 transition shadow-sm";
    row.innerHTML = `
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-1.5">
          <h4 class="text-xs font-bold text-slate-200 truncate">${p.name}</h4>
          ${p.fragile ? '<span class="text-[8px] bg-amber-500/10 text-amber-400 px-1 rounded border border-amber-500/20 font-bold shrink-0">FRAGILE</span>' : ''}
        </div>
        <p class="text-[10px] text-slate-400 mt-0.5">SKU: ${p.sku} | ${p.weight} lbs | Dims: ${p.length}"x${p.width}"x${p.height}"</p>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        <!-- Quantity adjuster -->
        <div class="flex items-center bg-slate-900/80 border border-slate-800 rounded-lg p-0.5">
          <button class="qty-minus-btn p-1 text-slate-400 hover:text-slate-200 transition" data-id="${item.productId}">
            <i data-lucide="minus" class="w-3 h-3"></i>
          </button>
          <span class="px-2.5 text-xs font-bold text-slate-200 font-mono">${item.quantity}</span>
          <button class="qty-plus-btn p-1 text-slate-400 hover:text-slate-200 transition" data-id="${item.productId}">
            <i data-lucide="plus" class="w-3 h-3"></i>
          </button>
        </div>
        <button class="remove-order-item-btn p-1.5 bg-slate-900 border border-slate-800 hover:bg-red-950/20 hover:text-red-400 hover:border-red-900/50 rounded-lg text-slate-500 transition"
                data-id="${item.productId}" title="Remove item">
          <i data-lucide="x" class="w-3.5 h-3.5"></i>
        </button>
      </div>
    `;
    container.appendChild(row);
  });

  countLabel.textContent = `${totalItems} Box${totalItems !== 1 ? 'es' : ''}`;
  lucide.createIcons();

  // Attach button events
  container.querySelectorAll('.qty-minus-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      adjustOrderItemQty(id, -1);
    });
  });

  container.querySelectorAll('.qty-plus-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      adjustOrderItemQty(id, 1);
    });
  });

  container.querySelectorAll('.remove-order-item-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      removeProductFromOrder(id);
    });
  });
}

function addProductToOrder(prodId) {
  const existing = currentOrder.find(item => item.productId === prodId);
  if (existing) {
    existing.quantity += 1;
  } else {
    currentOrder.push({ productId: prodId, quantity: 1 });
  }
  saveOrder();
  renderOrderItemsList();
}

function adjustOrderItemQty(prodId, change) {
  const item = currentOrder.find(item => item.productId === prodId);
  if (!item) return;

  item.quantity += change;
  if (item.quantity <= 0) {
    currentOrder = currentOrder.filter(i => i.productId !== prodId);
  }
  saveOrder();
  renderOrderItemsList();
}

function removeProductFromOrder(prodId) {
  currentOrder = currentOrder.filter(item => item.productId !== prodId);
  saveOrder();
  renderOrderItemsList();
}

function deleteProductFromDb(prodId) {
  products = products.filter(p => p.id !== prodId);
  // Also clean up current order if that product was deleted
  currentOrder = currentOrder.filter(item => item.productId !== prodId);
  saveProducts();
  saveOrder();
  renderProductDatabase();
  renderOrderItemsList();
}

function loadSampleOrder() {
  currentOrder = [
    { productId: 'rice-case', quantity: 12 },
    { productId: 'oil-case', quantity: 8 },
    { productId: 'bisc-case', quantity: 14 },
    { productId: 'soda-box', quantity: 10 },
    { productId: 'chip-box', quantity: 10 }
  ];
  saveOrder();
  renderOrderItemsList();
}

// Handle Admin Add Product Form submission
document.getElementById('add-product-form').addEventListener('submit', (e) => {
  e.preventDefault();

  const name = document.getElementById('prod-name').value.trim();
  const sku = document.getElementById('prod-sku').value.trim();
  const category = document.getElementById('prod-category').value;
  const length = parseFloat(document.getElementById('prod-l').value);
  const width = parseFloat(document.getElementById('prod-w').value);
  const height = parseFloat(document.getElementById('prod-h').value);
  const weight = parseFloat(document.getElementById('prod-wt').value);
  const fragile = document.getElementById('prod-fragile').checked;

  const id = `custom-${Date.now()}`;
  const newProd = { id, name, sku, category, length, width, height, weight, fragile };

  products.push(newProd);
  saveProducts();
  renderProductDatabase();

  // Reset form
  e.target.reset();
});

// Search input listener
document.getElementById('db-search').addEventListener('input', renderProductDatabase);

// Clear order
document.getElementById('clear-order-btn').addEventListener('click', () => {
  currentOrder = [];
  saveOrder();
  renderOrderItemsList();
  
  // Clear visualizer
  packedResult = { placed: [], unplaced: [], stats: { volumeUtil: 0, totalWeight: 0, maxHeight: 0, totalCount: 0, packedCount: 0 } };
  currentTimelineStep = 0;
  refreshTimelineVisuals();
  updateStatisticsUI();
  
  // Disable animation controls
  toggleTimelineControls(false);
});

// Load sample order
document.getElementById('load-sample-order-btn').addEventListener('click', loadSampleOrder);

// Run packing optimizer UI connector
document.getElementById('pack-pallet-btn').addEventListener('click', () => {
  if (currentOrder.length === 0) {
    alert("Please add items to the order first.");
    return;
  }

  // Run solver
  runPackingOptimizer();

  // Show status / stats
  updateStatisticsUI();

  // Configure timeline controls
  currentTimelineStep = packedResult.placed.length; // Show all by default
  const timelineSlider = document.getElementById('stack-timeline-slider');
  timelineSlider.max = packedResult.placed.length;
  timelineSlider.value = currentTimelineStep;
  
  document.getElementById('total-step-num').textContent = packedResult.placed.length;
  document.getElementById('step-info-container').style.display = 'flex';

  toggleTimelineControls(true);

  // Render meshes
  refreshTimelineVisuals();
  
  // Print console summary for debugging
  console.log("Pallet Packing Result:", packedResult);
  if (packedResult.unplaced.length > 0) {
    console.warn("Some items could not be placed due to size/weight/height constraints:", packedResult.unplaced);
  }
});

function toggleTimelineControls(enabled) {
  document.getElementById('anim-prev-btn').disabled = !enabled;
  document.getElementById('anim-play-btn').disabled = !enabled;
  document.getElementById('anim-next-btn').disabled = !enabled;
  document.getElementById('stack-timeline-slider').disabled = !enabled;
  document.getElementById('exploded-view-toggle').disabled = !enabled;
}

// ==========================================
// 6. TIMELINE & ANIMATION ACTIONS
// ==========================================

// Timeline slider change
document.getElementById('stack-timeline-slider').addEventListener('input', (e) => {
  currentTimelineStep = parseInt(e.target.value);
  refreshTimelineVisuals();
  updateExplodedPositions(); // apply explosion to newly rendered blocks if active
});

// Exploded view toggle
document.getElementById('exploded-view-toggle').addEventListener('change', (e) => {
  explodedViewActive = e.target.checked;
  updateExplodedPositions();
});

// Grid visibility toggle
document.getElementById('toggle-grid-btn').addEventListener('click', () => {
  gridVisible = !gridVisible;
  gridHelper.visible = gridVisible;
  
  const btn = document.getElementById('toggle-grid-btn');
  if (gridVisible) {
    btn.classList.add('text-brand-400');
  } else {
    btn.classList.remove('text-brand-400');
  }
});

// Camera view reset
document.getElementById('reset-camera-btn').addEventListener('click', () => {
  // Smoothly reset camera back to initial overview
  camera.position.set(70, 50, 75);
  controls.target.set(PALLET_W / 2, MAX_HEIGHT / 4, PALLET_L / 2);
  controls.update();
});

// Previous Step action
document.getElementById('anim-prev-btn').addEventListener('click', () => {
  if (currentTimelineStep > 0) {
    currentTimelineStep--;
    refreshTimelineVisuals();
    updateExplodedPositions();
  }
});

// Next Step action
document.getElementById('anim-next-btn').addEventListener('click', () => {
  if (currentTimelineStep < packedResult.placed.length) {
    currentTimelineStep++;
    refreshTimelineVisuals();
    updateExplodedPositions();
  }
});

// Play/Pause simulation
document.getElementById('anim-play-btn').addEventListener('click', () => {
  const playBtn = document.getElementById('anim-play-btn');
  const playIcon = document.getElementById('play-icon');

  if (isAnimating) {
    // Pause
    clearInterval(animationTimer);
    isAnimating = false;
    playIcon.setAttribute('data-lucide', 'play');
    playBtn.title = "Play Loading Animation";
    lucide.createIcons();
  } else {
    // Play
    isAnimating = true;
    playIcon.setAttribute('data-lucide', 'pause');
    playBtn.title = "Pause Loading Animation";
    lucide.createIcons();

    // If timeline is already at the end, start from 0
    if (currentTimelineStep >= packedResult.placed.length) {
      currentTimelineStep = 0;
      refreshTimelineVisuals();
    }

    animationTimer = setInterval(() => {
      if (currentTimelineStep < packedResult.placed.length) {
        currentTimelineStep++;
        refreshTimelineVisuals();
        updateExplodedPositions();
      } else {
        // Finished playing
        clearInterval(animationTimer);
        isAnimating = false;
        playIcon.setAttribute('data-lucide', 'play');
        playBtn.title = "Play Loading Animation";
        lucide.createIcons();
      }
    }, 700); // 700ms per box drop
  }
});

// ==========================================
// 7. BOOTSTRAP INITIALIZATION
// ==========================================

function initApp() {
  // Initialize state
  initState();
  
  // Render lists
  renderProductDatabase();
  renderOrderItemsList();
  
  // Start Three.js engine
  init3D();
}

window.addEventListener('DOMContentLoaded', initApp);
