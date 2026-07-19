# Restaurant Management System Specification

## Table E-paper Monitors

Each restaurant table has an e-paper monitor. The monitor displays:

- table number
- status: `Welcome` or `Table is in use`
- QR code for the ordering page

The QR code URL includes the table number so customer orders can be attached to the correct table session.

## Customer Ordering

After scanning the table QR code, the customer opens the ordering page in their phone browser. The first screen asks for language selection:

- Thai
- English
- Chinese
- Japanese
- Burmese

After choosing a language, the customer can browse the menu, add items to cart, and place an order. When the first order is placed, the e-paper display for that table must update to `Table is in use`.

## Kitchen Flow

When an order is placed, the kitchen monitor receives the order with the table number. A thermal printer below the kitchen monitor prints a slip containing:

- table number
- ordered food items
- slip number, also known as order ID
- barcode

The chef uses this slip while preparing the food. Once the dish is ready, the slip is placed inside the serving tray and delivered to the customer.

## Slip Number Rule

The slip number is generated on the customer's first order after scanning the QR code. A table can place multiple consecutive orders. All later orders for the same table session must use the exact same slip number until final checkout.

## Interfaces

- Customer-facing interface
- Kitchen interface
- Cashier/counter checkout interface
- Admin/management interface
- Captive portal interface

## Management Interface

Administrators can:

- add and manage menu items
- set and adjust item pricing
- view daily sales reports
- view complete transaction history

## Captive Portal

The restaurant provides guest Wi-Fi. Customers connecting to Wi-Fi are redirected to a captive portal survey. The survey asks for preferred language, current table number, gender, and age. After completion, the system grants 120 minutes of internet access for that day and disconnects access after the time limit.
