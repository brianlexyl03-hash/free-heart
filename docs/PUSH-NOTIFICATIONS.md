# Push notification delivery

The app can send Web Push notifications only to browsers that explicitly grant notification permission and register a subscription. It cannot notify every Google user, Gmail user, Android user, or browser user without consent; the browser and push provider enforce that boundary.

Broadcast delivery now uses bounded parallel Web Push requests controlled by `PUSH_CONCURRENCY` (default `32`) and performs one persistent-store write after the batch. Expired `404`/`410` subscriptions are disabled automatically. Followed-match alerts use the bulk sender so a goal, kick-off, half-time, postponement, or full-time alert does not wait for each subscriber serially. The service worker remains responsible for displaying the notification when the site is closed.

For production:

1. Set valid `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` values.
2. Store subscriptions on the durable `/data` volume via the existing push configuration.
3. Keep `PUSH_CONCURRENCY` within the provider’s operational limits; higher is not always faster and can trigger rate limiting.
4. Ask users to enable notifications through the site’s visible action. Do not repeatedly prompt denied users or use hidden subscriptions.
5. Use the live-match follow controls for targeted match alerts instead of broadcasting every score to every subscriber.

“Lightning speed” is bounded by the score-provider poll interval, the Web Push service, the user’s network, browser power-saving policy, and device notification settings. The live alert poll is currently 20 seconds; a provider event/webhook would be faster than polling when an authorized source offers one.
