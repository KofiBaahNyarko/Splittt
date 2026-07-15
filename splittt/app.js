/* ==========================================
   SPLITTT - CLIENT-SIDE APPLICATION LOGIC
   ========================================== */

// 1. STATE MANAGEMENT
const state = {
  friends: [
    { id: 'f1', name: 'You', initials: 'Y', color: 'hsl(210, 85%, 60%)' },
    { id: 'f2', name: 'Sarah', initials: 'S', color: 'hsl(280, 85%, 60%)' },
    { id: 'f3', name: 'Alex', initials: 'A', color: 'hsl(35, 85%, 60%)' }
  ],
  items: [],
  tax: { value: 0, isPercent: true },
  tip: { value: 0, isPercent: true },
  discount: { value: 0, isPercent: false },
  activeModalItemId: null,
  ocrWorker: null,
  currentStep: 1
};

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/splittt/sw.js')
      .then((reg) => console.log('Service worker registered:', reg.scope))
      .catch((err) => console.error('Service worker registration failed:', err));
  });
}

// Available HSL hues for dynamic friend colors
const FRIEND_HUES = [210, 280, 35, 150, 330, 180, 250, 80, 10, 300];
let currentHueIndex = 3; // Start after the first 3 preloaded hues

// 2. DOM ELEMENTS
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('file-input');
const cameraInput = document.getElementById('camera-input');
const btnBrowse = document.getElementById('btn-browse');
const btnCamera = document.getElementById('btn-camera');
const btnDemo = document.getElementById('btn-demo');
const statusArea = document.getElementById('status-area');
const receiptPreview = document.getElementById('receipt-preview');
const btnClearImage = document.getElementById('btn-clear-image');
const progressContainer = document.getElementById('progress-container');
const progressStatus = document.getElementById('progress-status');
const progressPercent = document.getElementById('progress-percent');
const progressBar = document.getElementById('progress-bar');

const friendNameInput = document.getElementById('friend-name-input');
const btnAddFriend = document.getElementById('btn-add-friend');
const friendsList = document.getElementById('friends-list');

const itemsList = document.getElementById('items-list');
const itemsEmptyState = document.getElementById('items-empty-state');
const btnAddItem = document.getElementById('btn-add-item');
const btnClearItems = document.getElementById('btn-clear-items');

const taxInput = document.getElementById('tax-input');
const taxToggle = document.getElementById('tax-toggle');
const tipInput = document.getElementById('tip-input');
const tipToggle = document.getElementById('tip-toggle');
const discountInput = document.getElementById('discount-input');
const discountToggle = document.getElementById('discount-toggle');
const presetBadges = document.querySelectorAll('.badge-btn');

const subtotalVal = document.getElementById('subtotal-val');
const taxVal = document.getElementById('tax-val');
const tipVal = document.getElementById('tip-val');
const discountVal = document.getElementById('discount-val');
const totalVal = document.getElementById('total-val');
const breakdownsList = document.getElementById('breakdowns-list');
const btnCopySummary = document.getElementById('btn-copy-summary');

// Modal Elements
const assignmentModal = document.getElementById('assignment-modal');
const modalItemName = document.getElementById('modal-item-name');
const modalItemDesc = document.getElementById('modal-item-desc');
const modalItemPrice = document.getElementById('modal-item-price');
const modalFriendsGrid = document.getElementById('modal-friends-grid');
const btnCloseModal = document.getElementById('btn-close-modal');
const btnModalSelectAll = document.getElementById('btn-modal-select-all');
const btnModalClear = document.getElementById('btn-modal-clear');
const btnModalSave = document.getElementById('btn-modal-save');
const toastContainer = document.getElementById('toast-container');

// Wizard navigation buttons
const btnStep2Back = document.getElementById('btn-step2-back');
const btnStep2Next = document.getElementById('btn-step2-next');
const btnStep3Back = document.getElementById('btn-step3-back'); 
const btnStep3Next = document.getElementById('btn-step3-next');
const btnStep4Back = document.getElementById('btn-step4-back');

// 3. INITIALIZATION
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  renderFriends();
  renderItems();
  updateCalculations();
  goToStep(1); // Ensure we start on step 1
});

// 4. EVENT LISTENERS
function setupEventListeners() {
  // Drag and Drop
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });
  
  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragover');
  });
  
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
      handleImageUpload(e.dataTransfer.files[0]);
    }
  });

  // Browse buttons
  btnBrowse.addEventListener('click', () => fileInput.click());
  btnCamera.addEventListener('click', () => cameraInput.click());
  
  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) handleImageUpload(e.target.files[0]);
  });
  
  cameraInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) handleImageUpload(e.target.files[0]);
  });

  // Clear preview image
  btnClearImage.addEventListener('click', () => {
    statusArea.classList.add('hidden');
    receiptPreview.src = '';
    fileInput.value = '';
    cameraInput.value = '';
    showToast('Image removed', 'info');
  });

  // Load Demo Receipt
  btnDemo.addEventListener('click', loadDemoReceipt);

  // Friend Operations
  btnAddFriend.addEventListener('click', handleAddFriend);
  friendNameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleAddFriend();
  });

  // Item Operations
  btnAddItem.addEventListener('click', () => {
    const newItem = addItem('New Item', 0.00);
    renderItems();
    // Focus the description input of the newly added item row
    setTimeout(() => {
      const row = document.querySelector(`[data-id="${newItem.id}"]`);
      if (row) {
        const input = row.querySelector('.item-desc-input');
        input.focus();
        input.select();
      }
    }, 50);
  });
  
  btnClearItems.addEventListener('click', () => {
    if (state.items.length === 0) return;
    if (confirm('Are you sure you want to clear all items?')) {
      state.items = [];
      renderItems();
      updateCalculations();
      showToast('Cleared all items', 'info');
    }
  });

  // Modifier Toggles & Inputs
  setupModifierInput(taxInput, taxToggle, state.tax);
  setupModifierInput(tipInput, tipToggle, state.tip);
  setupModifierInput(discountInput, discountToggle, state.discount);

  // Tip Preset Badges
  presetBadges.forEach(badge => {
    badge.addEventListener('click', () => {
      const percentage = parseFloat(badge.dataset.val);
      tipInput.value = percentage;
      state.tip.value = percentage;
      state.tip.isPercent = true;
      tipToggle.textContent = '%';
      tipToggle.classList.add('active');
      updateCalculations();
      showToast(`Applied ${percentage}% Tip`, 'success');
    });
  });

  // Copy Summary Breakdown
  btnCopySummary.addEventListener('click', copySummaryToClipboard);

  // Modal actions
  btnCloseModal.addEventListener('click', closeModal);
  btnModalSave.addEventListener('click', closeModal);
  btnModalSelectAll.addEventListener('click', () => {
    toggleModalFriendsAll(true);
  });
  btnModalClear.addEventListener('click', () => {
    toggleModalFriendsAll(false);
  });

  // Close modal clicking outside
  window.addEventListener('click', (e) => {
    if (e.target === assignmentModal) closeModal();
  });

  // Wizard Navigation binds
  btnStep2Back.addEventListener('click', () => goToStep(1));
  btnStep2Next.addEventListener('click', () => {
    if (state.friends.length === 0) {
      showToast('Add at least one friend to split with!', 'error');
      return;
    }
    goToStep(3);
  });
  btnStep3Back.addEventListener('click', () => goToStep(2));
  btnStep3Next.addEventListener('click', () => goToStep(4));
  btnStep4Back.addEventListener('click', () => goToStep(3));
}

// Helper to configure adjustments inputs
function setupModifierInput(inputEl, toggleEl, modifierObj) {
  inputEl.addEventListener('input', () => {
    modifierObj.value = parseFloat(inputEl.value) || 0;
    updateCalculations();
  });

  toggleEl.addEventListener('click', () => {
    modifierObj.isPercent = !modifierObj.isPercent;
    toggleEl.textContent = modifierObj.isPercent ? '%' : '$';
    if (modifierObj.isPercent) {
      toggleEl.classList.add('active');
    } else {
      toggleEl.classList.remove('active');
    }
    updateCalculations();
  });
  
  if (modifierObj.isPercent) {
    toggleEl.classList.add('active');
  }
}

// 5. WIZARD SCREEN NAVIGATION
function goToStep(stepNum) {
  if (stepNum < 1 || stepNum > 4) return;
  state.currentStep = stepNum;

  // Toggle View Cards Visibility
  for (let i = 1; i <= 4; i++) {
    const view = document.getElementById(`step-${i}-view`);
    if (i === stepNum) {
      view.classList.remove('hidden');
    } else {
      view.classList.add('hidden');
    }
  }

  // Update Stepper Progress Bar
  const stepsElements = document.querySelectorAll('.stepper .step');
  const stepLines = document.querySelectorAll('.stepper .step-line');

  stepsElements.forEach(stepEl => {
    const sVal = parseInt(stepEl.dataset.step);
    if (sVal < stepNum) {
      stepEl.classList.add('completed');
      stepEl.classList.remove('active');
    } else if (sVal === stepNum) {
      stepEl.classList.add('active');
      stepEl.classList.remove('completed');
    } else {
      stepEl.classList.remove('active', 'completed');
    }
  });

  stepLines.forEach((lineEl, idx) => {
    if (idx + 1 < stepNum) {
      lineEl.classList.add('completed');
    } else {
      lineEl.classList.remove('completed');
    }
  });
  
  // Focus logic for input elements when entering a step
  if (stepNum === 2) {
    setTimeout(() => friendNameInput.focus(), 150);
  }
}

// 6. TOAST ALERTS
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span>${message}</span>
  `;
  toastContainer.appendChild(toast);
  
  // Slide out and remove
  setTimeout(() => {
    toast.style.animation = 'scale-up 0.2s reverse ease-in forwards';
    setTimeout(() => toast.remove(), 200);
  }, 3000);
}

// 7. OCR AND RECEIPT SCANNING
async function handleImageUpload(file) {
  if (!file.type.startsWith('image/')) {
    showToast('Please upload an image file.', 'error');
    return;
  }

  // Display Image Preview
  const imageUrl = URL.createObjectURL(file);
  receiptPreview.src = imageUrl;
  statusArea.classList.remove('hidden');
  progressContainer.classList.remove('hidden');
  
  // Run OCR
  try {
    updateProgress('Initializing engine...', 5);
    
    // Create a new worker
    const worker = await Tesseract.createWorker('eng');
    state.ocrWorker = worker;

    updateProgress('Loading language model...', 25);
    
    const imageElement = document.createElement('img');
    imageElement.src = imageUrl;
    
    updateProgress('Scanning receipt content...', 55);
    
    const ret = await worker.recognize(file);
    const text = ret.data.text;
    
    updateProgress('Parsing prices and items...', 90);
    
    const parsed = parseReceiptText(text);
    
    if (parsed.items.length === 0) {
      showToast('Could not auto-detect items. Please enter them manually or retry.', 'info');
    } else {
      state.items = parsed.items;
      
      // Auto-populate modifiers if detected
      if (parsed.tax > 0) {
        taxInput.value = parsed.tax.toFixed(2);
        state.tax.value = parsed.tax;
        state.tax.isPercent = false;
        taxToggle.textContent = '$';
        taxToggle.classList.remove('active');
      }
      if (parsed.tip > 0) {
        tipInput.value = parsed.tip.toFixed(2);
        state.tip.value = parsed.tip;
        state.tip.isPercent = false;
        tipToggle.textContent = '$';
        tipToggle.classList.remove('active');
      }
      
      renderItems();
      updateCalculations();
      showToast(`Successfully scanned ${parsed.items.length} items!`, 'success');

      // Auto-advance to Step 2 (Friends)
      setTimeout(() => {
        goToStep(2);
      }, 1000);
    }
    
    await worker.terminate();
    state.ocrWorker = null;
    progressContainer.classList.add('hidden');
  } catch (err) {
    console.error(err);
    showToast('OCR failed. Loading manually.', 'error');
    progressContainer.classList.add('hidden');
    if (state.ocrWorker) {
      await state.ocrWorker.terminate();
      state.ocrWorker = null;
    }
  }
}

function updateProgress(status, percent) {
  progressStatus.textContent = status;
  progressPercent.textContent = `${percent}%`;
  progressBar.style.width = `${percent}%`;
}

// 8. REGEX RECEIPT PARSING ENGINE
// This function parses raw text returned by the OCR worker and extracts individual line items and prices.
// It matches lines with price values, cleans item descriptions, and filters out tax/totals metadata.
function parseReceiptText(text) {
  const result = {
    items: [],
    tax: 0,
    tip: 0
  };
  
  if (!text) return result;
  
  // Split the raw OCR text block into individual lines
  const lines = text.split('\n');
  
  // Common keywords present on receipts that represent metadata rather than individual billable items
  const skipKeywords = [
    'total', 'subtotal', 'sub', 'tax', 'hst', 'gst', 'pst', 'vat', 'visa', 'mc',
    'mastercard', 'amex', 'cash', 'change', 'balance', 'gratuity', 'tip',
    'card', 'payment', 'receipt', 'store', 'phone', 'tel', 'date', 'time',
    'order', 'welcome', 'guest', 'server', 'table', 'check', 'merchant',
    'highway', 'road', 'street', 'st', 'ave', 'rd', 'copy', 'merchant', 'auth'
  ];

  lines.forEach(line => {
    const cleanLine = line.trim().toLowerCase();
    if (cleanLine.length < 3) return;

    // Matches numbers in decimal format (e.g. 12.34 or 12,34) optionally preceded by a dollar sign.
    // Negative lookahead ensures we don't accidentally match part of a longer digit.
    const priceRegex = /(?:\$)?\s*(\d+[\.,]\d{2})(?!\d)/;
    const match = line.match(priceRegex);
    
    if (match) {
      // Normalize decimal separators to dots for parseFloat
      const priceStr = match[1].replace(',', '.');
      const price = parseFloat(priceStr);
      
      // The description is assumed to be everything to the left of the matched price
      const priceIndex = line.indexOf(match[0]);
      let desc = line.substring(0, priceIndex).trim();
      
      // Clean up quantity prefixes (e.g., '1x Margarita' -> 'Margarita') and common special characters
      desc = desc.replace(/^[\d\s*x\-]+/, '')
                 .replace(/[\$@\.\*:\-_]+/g, ' ')
                 .trim();
                 
      const descLower = desc.toLowerCase();
      
      // Check if the current row matches a modifier metadata category
      const isTax = descLower.includes('tax') || descLower.includes('gst') || descLower.includes('hst');
      const isTip = descLower.includes('tip') || descLower.includes('gratuity');
      const isSubtotal = descLower.includes('subtotal') || descLower.includes('sub total');
      const isTotal = descLower.includes('total') && !isSubtotal;
      
      if (isTax && price > 0) {
        result.tax = price;
      } else if (isTip && price > 0) {
        result.tip = price;
      } else if (!isTotal && !isSubtotal && desc.length > 2 && price > 0 && price < 1000) {
        // Confirm the item description does not contain skip keywords (like store details or card auths)
        const shouldSkip = skipKeywords.some(kw => {
          const regex = new RegExp(`\\b${kw}\\b`, 'i');
          return regex.test(descLower);
        });
        
        if (!shouldSkip) {
          result.items.push({
            id: 'i_' + Math.random().toString(36).substr(2, 9),
            desc: desc,
            price: price,
            assigned: [] // Initially unassigned
          });
        }
      }
    }
  });
  
  return result;
}

// 9. SIMULATED DEMO RECEIPT SCANNED
function loadDemoReceipt() {
  receiptPreview.src = 'assets/receipt_sample.png';
  statusArea.classList.remove('hidden');
  progressContainer.classList.remove('hidden');
  
  let percent = 0;
  const statuses = [
    { threshold: 10, msg: 'Initializing simulated Tesseract engine...' },
    { threshold: 30, msg: 'Detecting page boundaries...' },
    { threshold: 50, msg: 'Reading columns and blocks...' },
    { threshold: 75, msg: 'Parsing text and prices...' },
    { threshold: 90, msg: 'Resolving subtotal, tax, and individual items...' },
    { threshold: 100, msg: 'Done!' }
  ];
  
  const interval = setInterval(() => {
    percent += 5;
    const currentStatus = statuses.find(s => percent <= s.threshold) || statuses[statuses.length - 1];
    updateProgress(currentStatus.msg, percent);
    
    if (percent >= 100) {
      clearInterval(interval);
      setTimeout(() => {
        state.items = [
          { id: 'i_demo_1', desc: 'Margarita Pizza', price: 14.99, assigned: ['f1', 'f2'] },
          { id: 'i_demo_2', desc: 'Garlic Bread', price: 6.50, assigned: ['f1', 'f2', 'f3'] },
          { id: 'i_demo_3', desc: 'Diet Coke', price: 2.50, assigned: ['f3'] },
          { id: 'i_demo_4', desc: 'Chocolate Cake', price: 8.00, assigned: ['f2', 'f3'] }
        ];
        
        taxInput.value = '2.72';
        state.tax.value = 2.72;
        state.tax.isPercent = false;
        taxToggle.textContent = '$';
        taxToggle.classList.remove('active');
        
        tipInput.value = '';
        state.tip.value = 0;
        
        discountInput.value = '';
        state.discount.value = 0;
        
        progressContainer.classList.add('hidden');
        renderItems();
        updateCalculations();
        showToast('Sample receipt loaded and pre-split!', 'success');

        // Auto advance to Friends step!
        setTimeout(() => {
          goToStep(2);
        }, 1000);
      }, 300);
    }
  }, 100);
}

// 10. FRIENDS MANAGEMENT
function handleAddFriend() {
  const name = friendNameInput.value.trim();
  if (!name) return;

  const nameParts = name.split(/\s+/);
  let initials = '';
  if (nameParts.length > 1) {
    initials = nameParts[0][0] + nameParts[1][0];
  } else {
    initials = nameParts[0].substring(0, 2);
  }
  initials = initials.toUpperCase();

  const hue = FRIEND_HUES[currentHueIndex % FRIEND_HUES.length];
  currentHueIndex++;
  const color = `hsl(${hue}, 85%, 60%)`;

  const newFriend = {
    id: 'f_' + Math.random().toString(36).substr(2, 9),
    name: name,
    initials: initials,
    color: color
  };

  state.friends.push(newFriend);
  friendNameInput.value = '';
  friendNameInput.focus();

  renderFriends();
  updateCalculations();
  showToast(`Added friend: ${name}`, 'success');
}

function removeFriend(id) {
  if (id === 'f1') {
    showToast('Cannot delete yourself!', 'error');
    return;
  }

  const friend = state.friends.find(f => f.id === id);
  if (!friend) return;

  state.friends = state.friends.filter(f => f.id !== id);
  
  state.items.forEach(item => {
    item.assigned = item.assigned.filter(fid => fid !== id);
  });

  renderFriends();
  renderItems();
  updateCalculations();
  showToast(`Removed friend: ${friend.name}`, 'info');
}

function renderFriends() {
  friendsList.innerHTML = '';
  state.friends.forEach(friend => {
    const pill = document.createElement('div');
    pill.className = 'friend-pill';
    pill.innerHTML = `
      <div class="avatar" style="background-color: ${friend.color};">${friend.initials}</div>
      <span class="friend-name">${friend.name}</span>
      ${friend.id !== 'f1' ? `
        <button class="btn-close" onclick="removeFriend('${friend.id}')" title="Remove ${friend.name}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      ` : ''}
    `;
    friendsList.appendChild(pill);
  });
}

window.removeFriend = removeFriend;

// 11. ITEMS MANAGEMENT
function addItem(desc, price) {
  const newItem = {
    id: 'i_' + Math.random().toString(36).substr(2, 9),
    desc: desc,
    price: price,
    assigned: []
  };
  state.items.push(newItem);
  return newItem;
}

function removeItem(id) {
  state.items = state.items.filter(item => item.id !== id);
  renderItems();
  updateCalculations();
  showToast('Item deleted', 'info');
}
window.removeItem = removeItem;

function renderItems() {
  const existingRows = itemsList.querySelectorAll('.item-row');
  existingRows.forEach(row => row.remove());
  
  if (state.items.length === 0) {
    itemsEmptyState.classList.remove('hidden');
    return;
  }
  
  itemsEmptyState.classList.add('hidden');

  state.items.forEach(item => {
    const row = document.createElement('div');
    row.className = 'item-row';
    row.dataset.id = item.id;
    
    let assignedHTML = '';
    if (item.assigned.length === 0) {
      assignedHTML = `<span class="empty-assign-text">Tap to split...</span>`;
    } else {
      assignedHTML = `
        <div class="assigned-avatars">
          ${item.assigned.map(fid => {
            const friend = state.friends.find(f => f.id === fid);
            if (!friend) return '';
            return `<div class="avatar" style="background-color: ${friend.color};" title="${friend.name}">${friend.initials}</div>`;
          }).join('')}
        </div>
      `;
      
      if (item.assigned.length > 1) {
        const splitPrice = (item.price / item.assigned.length).toFixed(2);
        assignedHTML += `<span class="item-split-info">$${splitPrice} ea</span>`;
      }
    }

    row.innerHTML = `
      <div class="col-item">
        <input type="text" class="item-desc-input" value="${escapeHtml(item.desc)}" placeholder="Item description" data-field="desc">
      </div>
      <div class="col-price">
        <div class="item-price-wrapper">
          <input type="number" class="item-price-input" value="${item.price.toFixed(2)}" step="0.01" min="0" placeholder="0.00" data-field="price">
        </div>
      </div>
      <div class="col-split" onclick="openAssignmentModal('${item.id}')">
        <div class="assigned-friends-cell">
          ${assignedHTML}
        </div>
      </div>
      <div class="col-actions">
        <button class="btn-close" onclick="removeItem('${item.id}')" title="Delete item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    `;

    const descInput = row.querySelector('.item-desc-input');
    descInput.addEventListener('change', (e) => {
      item.desc = e.target.value.trim() || 'Item';
      updateCalculations();
    });

    const priceInput = row.querySelector('.item-price-input');
    priceInput.addEventListener('change', (e) => {
      const val = parseFloat(e.target.value) || 0;
      item.price = val;
      priceInput.value = val.toFixed(2);
      renderItems();
      updateCalculations();
    });

    itemsList.appendChild(row);
  });
}

function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, function(m) { return map[m]; });
}

// 12. DYNAMIC CALCULATIONS & BREAKDOWN GENERATION
// This function aggregates totals and computes individual splits proportionally.
// To ensure fairness, tax, tip, and discounts are distributed according to each person's ratio of the items subtotal.
function updateCalculations() {
  // 1. Calculate overall items subtotal
  const subtotal = state.items.reduce((sum, item) => sum + item.price, 0);
  subtotalVal.textContent = `$${subtotal.toFixed(2)}`;

  // 2. Compute absolute modifier values depending on percentage vs currency settings
  const taxAmount = state.tax.isPercent ? (subtotal * (state.tax.value / 100)) : state.tax.value;
  const tipAmount = state.tip.isPercent ? (subtotal * (state.tip.value / 100)) : state.tip.value;
  const discountAmount = state.discount.isPercent ? (subtotal * (state.discount.value / 100)) : state.discount.value;

  // 3. Compute final grand total
  const total = Math.max(0, subtotal + taxAmount + tipAmount - discountAmount);

  // Update summary fields in the UI
  taxVal.textContent = `$${taxAmount.toFixed(2)}`;
  tipVal.textContent = `$${tipAmount.toFixed(2)}`;
  discountVal.textContent = `$${discountAmount.toFixed(2)}`;
  totalVal.textContent = `$${total.toFixed(2)}`;

  // 4. Initialize share storage for each friend
  const shares = {};
  state.friends.forEach(f => {
    shares[f.id] = {
      friend: f,
      subtotal: 0,
      items: [],
      taxShare: 0,
      tipShare: 0,
      discountShare: 0,
      total: 0
    };
  });

  // 5. Allocate item portions to friends
  let totalAssignedSubtotal = 0;
  state.items.forEach(item => {
    const assignedCount = item.assigned.length;
    if (assignedCount === 0) return; // Unassigned items are skipped from ratio computations

    const portionPrice = item.price / assignedCount;
    totalAssignedSubtotal += item.price;

    item.assigned.forEach(fid => {
      if (shares[fid]) {
        shares[fid].subtotal += portionPrice;
        shares[fid].items.push({
          desc: item.desc,
          basePrice: item.price,
          splitPrice: portionPrice,
          splitCount: assignedCount
        });
      }
    });
  });

  // 6. Distribute tax, tip, and discounts proportionally
  state.friends.forEach(f => {
    const share = shares[f.id];
    if (totalAssignedSubtotal > 0) {
      // The ratio represents how much of the assigned bill this person is responsible for
      const ratio = share.subtotal / totalAssignedSubtotal;
      share.taxShare = taxAmount * ratio;
      share.tipShare = tipAmount * ratio;
      share.discountShare = discountAmount * ratio;
    } else {
      share.taxShare = 0;
      share.tipShare = 0;
      share.discountShare = 0;
    }
    // Final balance including portioned adjustments
    share.total = Math.max(0, share.subtotal + share.taxShare + share.tipShare - share.discountShare);
  });

  // Render the formatted individual breakdown cards
  renderBreakdowns(shares);
}

function renderBreakdowns(shares) {
  breakdownsList.innerHTML = '';
  
  const sortedShares = Object.values(shares).sort((a, b) => b.total - a.total);
  
  const unassignedItems = state.items.filter(item => item.assigned.length === 0);
  if (unassignedItems.length > 0) {
    const unassignedSubtotal = unassignedItems.reduce((sum, item) => sum + item.price, 0);
    const unassignedCard = document.createElement('div');
    unassignedCard.className = 'friend-share-card';
    unassignedCard.style.borderColor = 'rgba(239, 68, 68, 0.3)';
    unassignedCard.style.background = 'rgba(239, 68, 68, 0.04)';
    unassignedCard.innerHTML = `
      <div class="share-card-header">
        <div class="share-card-info">
          <div class="avatar" style="background-color: #ef4444;">!</div>
          <span class="share-card-name" style="color: #ef4444;">Unassigned Items</span>
        </div>
        <span class="share-card-amount" style="color: #ef4444;">$${unassignedSubtotal.toFixed(2)}</span>
      </div>
      <div class="share-card-details">
        ${unassignedItems.map(item => `
          <div class="share-item-row">
            <span class="share-item-name">${escapeHtml(item.desc)}</span>
            <span class="share-item-price">$${item.price.toFixed(2)}</span>
          </div>
        `).join('')}
        <p style="font-size: 0.75rem; color: #ef4444; margin-top: 4px; font-style: italic;">
          * These items are not included in anyone's share breakdown yet. Go back to Items to assign.
        </p>
      </div>
    `;
    breakdownsList.appendChild(unassignedCard);
  }

  sortedShares.forEach(share => {
    if (share.total === 0 && share.items.length === 0) return;

    const card = document.createElement('div');
    card.className = 'friend-share-card';
    
    let itemsHTML = '';
    if (share.items.length === 0) {
      itemsHTML = `<div class="share-item-row"><span class="share-item-name" style="font-style: italic;">No items assigned</span></div>`;
    } else {
      itemsHTML = share.items.map(item => {
        const splitText = item.splitCount > 1 ? `<span class="multiplier-info">(Shared 1/${item.splitCount})</span>` : '';
        return `
          <div class="share-item-row">
            <span class="share-item-name">${escapeHtml(item.desc)} ${splitText}</span>
            <span class="share-item-price">$${item.splitPrice.toFixed(2)}</span>
          </div>
        `;
      }).join('');
    }

    const adjustments = [];
    if (share.taxShare > 0) adjustments.push(`Tax: $${share.taxShare.toFixed(2)}`);
    if (share.tipShare > 0) adjustments.push(`Tip: $${share.tipShare.toFixed(2)}`);
    if (share.discountShare > 0) adjustments.push(`Discount: -$${share.discountShare.toFixed(2)}`);
    
    let adjustmentsHTML = '';
    if (adjustments.length > 0) {
      adjustmentsHTML = `
        <div class="share-item-row" style="border-top: 1px dashed rgba(255,255,255,0.05); padding-top: 4px; margin-top: 4px; font-size: 0.8rem; font-style: italic;">
          <span>Portioned Adjustments:</span>
          <span>${adjustments.join(' | ')}</span>
        </div>
      `;
    }

    card.innerHTML = `
      <div class="share-card-header">
        <div class="share-card-info">
          <div class="avatar" style="background-color: ${share.friend.color};">${share.friend.initials}</div>
          <span class="share-card-name">${share.friend.name}</span>
        </div>
        <span class="share-card-amount">$${share.total.toFixed(2)}</span>
      </div>
      <div class="share-card-details">
        ${itemsHTML}
        ${adjustmentsHTML}
        <div class="share-item-row" style="font-weight: 600; border-top: 1px dashed rgba(255,255,255,0.05); padding-top: 4px; margin-top: 4px; color: var(--text-main);">
          <span>Subtotal + Adjustments</span>
          <span>$${share.total.toFixed(2)}</span>
        </div>
      </div>
    `;
    
    breakdownsList.appendChild(card);
  });
}

// 13. ASSIGNMENT MODAL IMPLEMENTATION
function openAssignmentModal(itemId) {
  const item = state.items.find(i => i.id === itemId);
  if (!item) return;

  state.activeModalItemId = itemId;
  modalItemName.textContent = 'Assign Splitters';
  modalItemDesc.textContent = item.desc;
  modalItemPrice.textContent = `$${item.price.toFixed(2)}`;

  renderModalFriends();
  assignmentModal.classList.remove('hidden');
}

function renderModalFriends() {
  modalFriendsGrid.innerHTML = '';
  const item = state.items.find(i => i.id === state.activeModalItemId);
  if (!item) return;

  state.friends.forEach(friend => {
    const isSelected = item.assigned.includes(friend.id);
    const card = document.createElement('div');
    card.className = `friend-select-card ${isSelected ? 'selected' : ''}`;
    card.innerHTML = `
      <div class="avatar" style="background-color: ${friend.color};">${friend.initials}</div>
      <span class="friend-select-name">${friend.name}</span>
    `;
    
    card.addEventListener('click', () => {
      toggleFriendAssignment(friend.id);
    });

    modalFriendsGrid.appendChild(card);
  });
}

function toggleFriendAssignment(friendId) {
  const item = state.items.find(i => i.id === state.activeModalItemId);
  if (!item) return;

  const index = item.assigned.indexOf(friendId);
  if (index === -1) {
    item.assigned.push(friendId);
  } else {
    item.assigned.splice(index, 1);
  }

  renderModalFriends();
  renderItems();
  updateCalculations();
}

function toggleModalFriendsAll(selectAll) {
  const item = state.items.find(i => i.id === state.activeModalItemId);
  if (!item) return;

  if (selectAll) {
    item.assigned = state.friends.map(f => f.id);
  } else {
    item.assigned = [];
  }

  renderModalFriends();
  renderItems();
  updateCalculations();
}

function closeModal() {
  assignmentModal.classList.add('hidden');
  state.activeModalItemId = null;
}

window.openAssignmentModal = openAssignmentModal;

// 14. GENERATE BREAKDOWN COPY TEXT
// Formats the entire bill-splitting structure into a copyable text summary.
// Renders grand totals, individual friend breakdowns, shared status indicators, and list warnings.
function copySummaryToClipboard() {
  if (state.items.length === 0) {
    showToast('Add some items first!', 'error');
    return;
  }

  // Calculate absolute values for subtotal and modifiers
  const subtotal = state.items.reduce((sum, item) => sum + item.price, 0);
  const taxAmount = state.tax.isPercent ? (subtotal * (state.tax.value / 100)) : state.tax.value;
  const tipAmount = state.tip.isPercent ? (subtotal * (state.tip.value / 100)) : state.tip.value;
  const discountAmount = state.discount.isPercent ? (subtotal * (state.discount.value / 100)) : state.discount.value;
  const total = Math.max(0, subtotal + taxAmount + tipAmount - discountAmount);

  // Initialize shares mapping local to this string generator
  const shares = {};
  state.friends.forEach(f => {
    shares[f.id] = { friend: f, subtotal: 0, items: [], total: 0 };
  });

  // Apportion item prices
  let totalAssignedSubtotal = 0;
  state.items.forEach(item => {
    if (item.assigned.length === 0) return;
    const portion = item.price / item.assigned.length;
    totalAssignedSubtotal += item.price;
    item.assigned.forEach(fid => {
      shares[fid].subtotal += portion;
      shares[fid].items.push({ desc: item.desc, splitPrice: portion, splitCount: item.assigned.length });
    });
  });

  // Calculate portioned tax, tip, and discount totals locally
  state.friends.forEach(f => {
    const share = shares[f.id];
    if (totalAssignedSubtotal > 0) {
      const ratio = share.subtotal / totalAssignedSubtotal;
      const taxShare = taxAmount * ratio;
      const tipShare = tipAmount * ratio;
      const discountShare = discountAmount * ratio;
      share.total = Math.max(0, share.subtotal + taxShare + tipShare - discountShare);
    }
  });

  // Build the markdown-compatible output string
  let text = `💸 *Splittt Bill Breakdown* 💸\n`;
  text += `------------------------------------\n`;
  
  text += `Subtotal: $${subtotal.toFixed(2)}\n`;
  if (taxAmount > 0) text += `Tax: $${taxAmount.toFixed(2)}\n`;
  if (tipAmount > 0) text += `Tip: $${tipAmount.toFixed(2)}\n`;
  if (discountAmount > 0) text += `Discount: -$${discountAmount.toFixed(2)}\n`;
  text += `*Grand Total: $${total.toFixed(2)}*\n`;
  text += `------------------------------------\n\n`;

  // Filter to friends with active shares
  const activeShares = Object.values(shares).filter(s => s.total > 0);
  activeShares.forEach(s => {
    text += `*${s.friend.name} owes: $${s.total.toFixed(2)}*\n`;
    s.items.forEach(item => {
      const sharedLabel = item.splitCount > 1 ? ` (shared 1/${item.splitCount})` : '';
      text += `  - ${item.desc}${sharedLabel}: $${item.splitPrice.toFixed(2)}\n`;
    });
    text += `\n`;
  });

  // Append warnings for any items not assigned to any group members
  const unassigned = state.items.filter(item => item.assigned.length === 0);
  if (unassigned.length > 0) {
    text += `⚠️ *Unassigned Items (Not Split):*\n`;
    unassigned.forEach(item => {
      text += `  - ${item.desc}: $${item.price.toFixed(2)}\n`;
    });
    text += `\n`;
  }

  text += `Generated with splittt ⚡`;

  // Write text output to local user clipboard
  navigator.clipboard.writeText(text).then(() => {
    showToast('Breakdown copied to clipboard!', 'success');
  }).catch(err => {
    console.error('Could not copy text: ', err);
    showToast('Failed to copy to clipboard', 'error');
  });
}
