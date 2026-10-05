from pathlib import Path

content = """# Features to Add to the Visitor Management System

## 1. Tourist Information
- Create a public tourist information section.
- Display information about Murchison Falls National Park.
- Show animals, attractions, activities, accommodation options and entry points.
- Provide maps, routes and important locations within the park.
- Make information available to tourists before, during and after their visit.

## 2. Visitor Registration
- Allow tourists to create/register their visitor details.
- Capture visitor country/place of origin.
- Capture intended visit date and time.
- Capture intended length of stay.
- Capture expected entry point.
- Store visitor information for management and reporting.

## 3. Expression of Interest and Booking
- Allow tourists to express interest in visiting the park.
- Allow tourists to make a booking before arrival.
- Allow visitors to select their intended visit date and time.
- Allow visitors to select/indicate their expected entry point.
- Allow visitors to indicate their intended length of stay.
- Support accommodation information or booking where applicable.
- Send booking/visit reminders before arrival, including approximately one week and one day before the visit.
- Allow management to see the expected number of visitors for each day.

## 4. Walk-in Visitor Registration
- Allow visitors who arrive without a booking to register at the entrance.
- Allow walk-in visitors to make payment at the entrance.
- Clearly distinguish walk-in visitors from pre-booked visitors.
- Include both visitor categories in visitor statistics and revenue reports.

## 5. Payment and Ticketing
- Allow visitors to make the required payment.
- Generate a digital ticket after successful payment.
- Store payment and ticket information.
- Associate each ticket with the relevant visitor.
- Support payment and entry records for different gates.
- Include payments in revenue reconciliation.

## 6. QR-Code Ticketing
- Generate a unique QR code after payment.
- Use the QR code as proof of payment and entry authorisation.
- Allow QR codes to be scanned at park entrances.
- Allow QR codes to be scanned at internal checkpoints.
- Allow QR codes to be scanned when visitors exit.
- Record the date, time and location of every scan.
- Update the visitor's status after every scan.

## 7. Entrance Scanning
- Provide an interface for entrance/checkpoint officers.
- Scan visitor QR codes.
- Verify whether the ticket is valid.
- Verify whether the ticket has already been used/expired where applicable.
- Record the entry gate.
- Update the visitor status to "Inside the park" after successful entry.

## 8. Internal Checkpoint Management
- Allow officers to scan visitor QR codes at selected checkpoints.
- Record the checkpoint location.
- Record date and time of checkpoint scanning.
- Update the visitor's current status/location.
- Allow management to know which visitors have passed through checkpoints.

## 9. Exit and Re-entry Management
- Allow officers to scan tickets when visitors leave the park.
- Record the exit location and time.
- Change the visitor status to "Exited".
- Define ticket validity based on the configured visit duration.
- Distinguish between an expired ticket and a valid ticket belonging to a visitor who temporarily exited.
- Support re-entry where the ticket is still valid.
- Require a new payment where the existing ticket is no longer valid.
- Prevent re-entry using expired tickets.

## 10. Multiple Entry and Exit Points
- Support multiple park entrances and exits.
- Identify the different gates covered by the system.
- Show expected visitors for each entry point.
- Record payments and entries separately for each gate.
- Reconcile visitor numbers across all gates.
- Reconcile revenue across all gates.
- Include ferry entry points where applicable.

## 11. Accommodation
- Display available accommodation information.
- Where applicable, allow visitors to include accommodation requirements in their booking.
- Associate accommodation information with the visitor's planned stay.

## 12. Notifications and Reminders
- Send reminders to visitors before their scheduled visit.
- Send an early reminder, such as one week before arrival.
- Send another reminder, such as one day before arrival.
- Notify visitors about relevant booking/visit information.
- Allow management to monitor upcoming visits.

## 13. Maps and Navigation
- Provide a map of the park.
- Display entrances and exits.
- Display important locations and checkpoints.
- Show relevant routes within the park.
- Help tourists understand locations before and during their visit.

## 14. Visitor Tracking and Status
The system should maintain a visitor status throughout the visit.

Possible statuses:
- Booked
- Expected
- Arrived
- Paid
- Inside the park
- At a checkpoint
- Exited
- Ticket expired

The status should automatically change based on actions such as registration, payment, entrance scanning, checkpoint scanning and exit scanning.

## 15. Revenue Reconciliation and Reporting
- Track revenue from pre-booked visitors.
- Track revenue from walk-in visitors.
- Track revenue by entrance/gate.
- Compare visitor numbers against payments.
- Reconcile revenue across different gates.
- Generate visitor statistics.
- Include pre-booked and walk-in visitors in reports.
- Provide reliable visitor statistics for management.

## 16. Management Dashboard and Reports
Provide a management dashboard showing:
- Expected visitors
- Visitors who have arrived
- Visitors currently inside the park
- Visitors at checkpoints
- Visitors who have exited
- Expired tickets
- Visitors by entry point
- Visitors by country/place of origin
- Pre-booked visitors
- Walk-in visitors
- Revenue collected
- Revenue by gate
- Visitor statistics over time

## 17. User Roles and Access Control

### Tourist/Visitor
- View park information.
- Register.
- Express interest.
- Make bookings.
- Make payments.
- Receive/view tickets.
- View QR code.
- View booking and visit information.

### Entrance Officer
- Register walk-in visitors.
- Process payments where applicable.
- Scan QR codes.
- Verify tickets.
- Record visitor entry.

### Checkpoint Officer
- Scan visitor QR codes.
- Record checkpoint visits.
- View the information necessary to verify a visitor.

### Exit Officer
- Scan QR codes.
- Record visitor exit.
- Verify ticket validity for re-entry where applicable.

### Park Administrator
- Manage users.
- Manage visitor records.
- Manage gates/checkpoints.
- Manage ticket configurations.
- View reports.

### Park Management
- View dashboards.
- Monitor expected and current visitors.
- Monitor visitor movement.
- Monitor revenue.
- View management reports.

### Accommodation Provider
- Where applicable, manage accommodation information or bookings.
"""

path = Path("/mnt/data/visitor_management_system_features.md")
path.write_text(content, encoding="utf-8")
print(path)
