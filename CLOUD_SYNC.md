# Cloud sync setup

The app can sync Sean and Kick's workout profiles between phones using Supabase. Without configuration, it continues to work in local-only mode and saves workouts in that browser's local storage.

## Create and secure the Supabase project

1. Create a Supabase project and open its SQL Editor.
2. Run [`supabase/setup.sql`](./supabase/setup.sql) once. It creates the workout tables, row-level security policies, and Realtime publication.
3. Set up Google OAuth:
   - In Google Cloud Console, create an OAuth client ID for a **Web application**. Add the Supabase **Callback URL** shown under **Authentication → Providers → Google** to the Google OAuth client's authorized redirect URIs.
   - Enable the Google provider in Supabase and enter the Google OAuth client ID and client secret there.
   - In Supabase **Authentication → URL Configuration**, set the site URL to `https://seancs03.github.io/managing-work/` and add that same URL to the allowed redirect URLs.
4. Each of you opens the app and presses **Continue with Google** once. This registers your existing Google account with the Supabase project; no separate password account is needed. The app will deny access until the two emails are allowlisted in the next step.
5. In the Supabase SQL Editor, allow the two Google email addresses to access the shared workout space:

   ```sql
   insert into public.workout_sync_members (user_id)
   select id
   from auth.users
   where lower(email) in ('sean@example.com', 'kick@example.com')
   on conflict (user_id) do nothing;

   select m.user_id, u.email
   from public.workout_sync_members as m
   join auth.users as u on u.id = m.user_id;
   ```

   Replace the example addresses with your actual Google account emails. Verify that the result contains exactly those two accounts. The list is the access control: other Google users may authenticate with Supabase, but they cannot read or change either workout profile.

6. In **Project Settings → API**, copy the Project URL and the **anon/public** key (or publishable key). Put them in `cloud-config.js`:

   ```js
   window.WORKOUT_CLOUD_CONFIG = {
     supabaseUrl: "https://your-project.supabase.co",
     supabaseAnonKey: "your-public-anon-or-publishable-key",
   };
   ```

   The anon/public key is designed to be included in a client app; access is restricted by the SQL row-level security policies. **Never put a service-role or secret key in this repository.**

7. Publish the updated site and `cloud-config.js`. Both people sign in with their own Google account on their phone, then select Sean or Kick. Edits sync to the cloud and the other open device receives updates in real time. If both cloud and that device already have data for a profile, the app asks whether to use the cloud copy or replace it with that device's copy.

## Notes

- Initial migration uploads a device's local profile when no cloud copy exists. If a cloud copy already exists and local data differs, the choice dialog prevents accidental overwrite; it does not merge two different workout histories.
- When the network is unavailable, changes continue to save locally. They are sent to Supabase after connectivity returns or the next workout edit. Until the status says **Cloud synced**, those changes should be treated as device-only.
- If both phones edit the same profile at the same time, the most recently saved full profile replaces the earlier version. Avoid simultaneous editing of the same profile.
- Any of the two authorized accounts can view and edit both Sean and Kick profiles. Removing a person means deleting their row from `workout_sync_members` in the Supabase SQL Editor.
