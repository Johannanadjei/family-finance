# Part F — Cookies & Local Storage

> **⚠️ DRAFT — pending qualified Ghanaian counsel review.** This document has been prepared as part of the Money BOS Limited Legal & Compliance Handbook (MBOS-LEG-HB-001 v1.0, effective 1 June 2026). It is published in draft form as a transparency artefact while the Company finalises its Data Protection Commission registration and obtains formal counsel sign-off. The Company will replace this notice with a "v1.0 final" marker once that process is complete. Effective wording and legal interpretation are governed by Applicable Law of the Republic of Ghana.

> **Scope notice.** This page is one of four public-facing instruments published from the Money BOS Limited Legal & Compliance Handbook (MBOS-LEG-HB-001). The handbook also contains internal-only instruments (Parts C, D, E, H, I) covering software licensing, data processing for enterprise customers, internal security policy, vendor management and incident response. References below to internal Parts are retained for cross-reference traceability and are available to enterprise customers and regulators on request to **info@moneybos.com**.


**MONEY BOS LIMITED — COOKIES & LOCAL STORAGE NOTICE**

Effective date: 1 June 2026  |  Version 1.0

**This Notice explains what the Money B.O.S application (the “Service”) stores on your device. **It should be read together with Part B (Privacy Policy).

## F.1 We Do Not Use Cookies

**F.1.1 **The Service does not set cookies. We do not place any cookie on your device, and we do not use cookie identifiers to recognise, profile or track you.

**F.1.2 **Instead, the Service uses your browser’s **local storage** and **session storage**. These are standard browser features that let the app remember a small amount of information on your own device. Unlike cookies, this information is never automatically transmitted to us with each request — it stays in your browser until it is cleared.

## F.2 What We Store on Your Device

**F.2.1 **We store only the following, all of which are necessary for the Service to work as you would expect:

- **Your sign-in session **— a secure authentication token issued by our authentication provider, so that you stay signed in and do not have to re-enter your password on every visit. This is stored in local storage by the Supabase authentication library.

- **Device preferences **— your chosen theme and accent colour, your notification preferences, and the last BOS Hub you had open (keys beginning `ffc_theme_`, `ffc_notifications`, `ffc_active_centre_id`).

- **App PIN state **— a flag recording that you have entered your PIN correctly in the current browser session, together with a count of failed attempts and any lockout expiry time, so the PIN lock can protect your data (keys `ffc_pin_unlocked`, `ffc_pin_attempts`, `ffc_lockout_until`). **Your PIN itself is never stored on your device.** It is held only in hashed form on our servers.

- **Guest contributor session **— where someone submits an expense through a guest link, their temporary session is held in session storage only (key `ffc_guest_session`).

- **Install prompt state **— whether you have dismissed the “add to home screen” prompt in the current session (key `ffc_install_dismissed`).

**F.2.2 **Session storage entries are erased automatically when you close the tab or the app. Local storage entries remain until you clear them, or until you sign out, which removes the sign-in session.

**F.2.3 **We do not store your budgets, transactions, income figures or any other financial data on your device. That data lives only in our database, as described in Part B.

## F.3 No Analytics, Tracking or Advertising

**F.3.1 **The Service contains no analytics or product-measurement tools, no tracking pixels or web beacons, no advertising or re-targeting technologies, no social-media tracking widgets, and no cross-site or cross-device tracking of any kind.

**F.3.2 **We do not send tracking pixels in our emails and do not measure whether an email has been opened. We do not sell or share any information for advertising purposes.

## F.4 Why There Is No Cookie Banner

**F.4.1 **Because we set no cookies and use no analytics, advertising or other non-essential technologies, there is nothing on which your consent is required. We therefore do not display a cookie banner and do not operate a cookie preference centre. Everything described in section F.2 is strictly necessary to deliver the Service you have asked for.

**F.4.2 **If we ever introduce a technology that requires consent, we will update this Notice and obtain your consent before that technology is used, as required by the Data Protection Act, 2012 (Act 843).

## F.5 How to Clear What Is Stored

**F.5.1 **Signing out of the Service removes your session from local storage. You can also clear local and session storage at any time through your browser settings (usually under “Clear browsing data” or “Site settings”, by clearing cookies and site data for our domain).

**F.5.2 **If you clear this data you will be signed out and your device preferences will return to their defaults. No financial data is lost, because none of it is stored on your device.

## F.6 Server Logs

**F.6.1 **Our hosting provider, Vercel Inc., automatically records standard server logs when the Service is accessed. These logs contain technical data including your IP address, the date and time of the request, the resource requested, and your browser and device type. Our database and authentication provider, Supabase Inc., keeps equivalent logs for requests made to it.

**F.6.2 **These logs are generated by the infrastructure itself, not by any cookie or tracking technology, and are used only to operate, secure and troubleshoot the Service — for example, to detect abuse, diagnose errors and maintain reliability. We rely on our legitimate interests in the security and integrity of the Service as our lawful basis, and the logs are retained by those providers for a limited period in line with their standard retention.

## F.7 Third-Party Sites You Are Sent To

**F.7.1 **Two features send you to a third party’s own website, which is governed by that third party’s policies and not by this Notice:

- **“Continue with Google” **— if you choose to sign in with Google, you are taken to Google’s sign-in pages and authentication data is exchanged with Google LLC in order to verify your identity and return your email address and basic profile information to us. Google is a recipient located outside the Republic of Ghana, in the United States. This transfer is covered by Part B, section 7 (International Transfers). You are not required to use Google sign-in; email and password sign-in is available instead.

- **Subscription payment **— when you upgrade, you are taken to the checkout pages of our payment provider, Paystack, to enter your payment details. We never see or store your card or mobile-money credentials.

**F.7.2 **Google and Paystack may set cookies on their own websites while you are there. We do not control those cookies, receive no information from them, and set none of our own on those pages.

**F.7.3 **Apart from these two user-initiated redirects, the Service loads no resources from any third-party domain. It uses no external fonts, scripts, stylesheets or content delivery networks, so simply opening the Service contacts no one other than our own hosting and database providers.

## F.8 Changes

**F.8.1 **We may update this Notice from time to time. We will post the updated version within the Service with a revised effective date. If we ever begin using cookies or any technology requiring your consent, we will tell you before we do so.
