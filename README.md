# spli<span>ttt</span> ⚡

**Splittt** is a modern, client-side web application designed to help friends split bills, food, groceries, or any receipt by scanning it (via camera or file upload), parsing the items and prices using on-device OCR, and offering a guided wizard interface to allocate shares, add adjustments, and copy payment breakdowns.

---

## 🚀 Key Features

*   **Wizard Navigation Flow**: Guides users step-by-step through:
    1.  **Scan**: Capture or drag-and-drop a receipt (or load our preset sample demo).
    2.  **Friends**: Add members of the group with initials-based color avatars.
    3.  **Items**: Edit item list and choose who shared each item (shares are split evenly per item).
    4.  **Settle**: Add tax/tip/discount adjustments and review individual payment breakdowns.
*   **On-Device OCR (Tesseract.js)**: Scans receipts entirely inside the browser. No server uploads, no APIs, and complete privacy.
*   **Mathematically Fair Splitting**: Adjustments (Tax, Tip, and Discounts) are automatically distributed **proportionally** based on each friend's personal subtotal.
*   **Interactive Modal Allocator**: Easily toggle sharing configurations (e.g. split a pizza between 3 people, but keep drinks on individual tabs).
*   **Copier System**: Generates a clean markdown breakdown copy-text optimized for WhatsApp, iMessage, or Venmo comments.
*   **Premium Glassmorphism Design**: Custom dark-mode system built with modern typography, frosted-glass containers, HSL color tokens, and micro-animations.

---

## 📁 Directory Structure

```text
splittt/
├── index.html        # Semantic HTML5 elements, modal structure, and CDNs
├── style.css         # Glassmorphism design tokens, layout variables, and responsive grids
├── app.js            # State machine, regex parser, Tesseract scanner, and math calculations
└── assets/
    └── receipt_sample.png  # High-contrast restaurant receipt used for the demo sequence
```

---

## 🧮 How the Splitting Math Works

Splittt uses prportional allocation which is the fairest way to distribute extra charges like tax, tip, or discounts:

1.  **Individual Subtotal**: For every item, the cost is split evenly among its assigned friends:
    $$\text{Portion} = \frac{\text{Item Price}}{\text{Number of Assigned Friends}}$$
    A friend's personal subtotal ($S_{\text{friend}}$) is the sum of all their individual item portions.
2.  **Proportion Ratio**: We determine each friend's ratio of the active subtotal ($S_{\text{total}}$):
    $$\text{Ratio}_{\text{friend}} = \frac{S_{\text{friend}}}{S_{\text{total}}}$$
3.  **Adjustment Portions**: Extra costs are multiplied by each friend's ratio:
    *   $\text{Tax Share} = \text{Total Tax} \times \text{Ratio}_{\text{friend}}$
    *   $\text{Tip Share} = \text{Total Tip} \times \text{Ratio}_{\text{friend}}$
    *   $\text{Discount Share} = \text{Total Discount} \times \text{Ratio}_{\text{friend}}$
4.  **Final Owed Amount**:
    $$\text{Grand Total}_{\text{friend}} = S_{\text{friend}} + \text{Tax Share} + \text{Tip Share} - \text{Discount Share}$$

*Note: Unassigned items are excluded from individual subtotals and ratios, but shown in a separate warning card.*

---

## 💻 Local Setup & Execution

Since Splittt is built using vanilla HTML/CSS/JS, it runs directly in the browser and requires no compilation. However, because Tesseract.js loads WebAssembly workers dynamically, standard browsers block it under CORS security rules if opened directly as a local file (`file:///...`).

To run it, start a simple local server:

### Using Python (Pre-installed on macOS/Linux)
Open your terminal in the `.../splittt/` directory and run:
```bash
python3 -m http.server 8200
```
Then visit: **[http://localhost:8200](http://localhost:8200)**

### Using Node.js (npm)
If you prefer npm, install `serve` globally or run it on the fly:
```bash
npx serve -l 8200
```
Then visit: **[http://localhost:8200](http://localhost:8200)**
