# CampusPulse: Smart Laboratory Resource Allocation & Asset Recovery System
Frontend built with HTML5, CSS3 and vanilla ES6 JavaScript. No server or install needed.

## Run
Unzip, then double-click `index.html` (the Welcome page, with Sign in and Register buttons) in Chrome, Edge or Firefox. No build step.

## Accounts
- **Students register themselves** (Register page) with their email, name, **roll number** (e.g. `CS-810`) and **department**. Roll number and department are fixed after registration (read-only on the Profile page; the save logic also refuses changes). Only an older account that never had them can set them once. The Administrator and Lab Assistant see each requesting student's name, roll number and department on claims, bookings and the users list. Department choices: `DEPARTMENTS` in `js/app-config.js`.
- **Lab Assistants** may also register. **Administrators cannot self-register**; one bootstrap administrator and one bootstrap lab assistant are created on first run (password `Campus@123`):
  - Lab Assistant: `ihtisham@uet.pk`
  - Administrator: `umer@uet.pk`
- Permitted email domains (edit `EMAIL_DOMAINS` in `js/app-config.js`): Student `@student.uet.pk`; Lab Assistant and Administrator `@uet.pk`.
- The role chosen at sign-in must match the registered account, otherwise sign-in is refused.

## Resources
Computer Science only: Lab 2.02 (PC1, PC2, PC3) and Lab 2.03 (PC1, PC2, PC3, Projector). Edit `SEED.resources` in `js/app-data.js` to change them.

## Booking workflow
1. Student books a resource -> **Reserved** (slot held, resource shows **Booked**).
2. The **15-minute grace period starts at the booking's start time**. A **Lab Assistant** verifies the student's arrival -> **Confirmed**.
3. If nobody verifies before the grace period ends -> **Unverified** and the slot is released.
4. Finished verified bookings become **Completed**; student cancellations become **Cancelled**.
- Lab Assistants verify bookings. Administrators approve/reject **Lost & Found claims** and manage resource **maintenance**; admins can view (not verify) bookings.
- All timers use saved timestamps, so refreshing, closing the tab or closing the browser never resets them.

## Data
Everything is stored in this browser: `cp_users` (accounts), `cp_data_v3` (bookings, items, claims, maintenance flags) in localStorage and `cp_uid` (current session) in sessionStorage.

## Frontend-only limitations (read this)
- localStorage belongs to one browser on one device. Two students on two computers each have separate data, so **this code cannot prevent them double-booking the same slot**. Within one browser it is atomic (re-read, Web Lock, write, verify) and other tabs update live.
- Role checks, domain checks and password hashing run in the browser and can be bypassed with developer tools. **Real authorization and authentication require a backend** (see `js/api-client.js` / `js/app-config.js` for the Flask hook).
- Timers rely on the device clock.
