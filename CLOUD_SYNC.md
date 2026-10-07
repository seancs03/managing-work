# Cloud sync setup

The app can sync Sean and Kick's workout profiles between phones using Supabase. Without configuration, it continues to work in local-only mode and saves workouts in that browser's local storage.

## Create and secure the Supabase project

1. Create a Supabase project and open its SQL Editor.
2. Run [`supabase/setup.sql`](./supabase/setup.sql) once. It creates the workout tables, row-level security policies, and Realtime publication.
3. In **Authentication → Providers → Email**, turn off public sign-ups. Create one email/password account for each of the two users using the Supabase dashboard.
4. In the SQL Editor, add those two Auth user IDs to the shared workout space:

   ```sql
   insert into public.workout_sync_members (user_id)
   select id
   from auth.users
   where email in ('sean@example.com', 'kick@example.com');
   ```

   Replace the example addresses with the two account emails. Verify that exactly two rows were inserted. Only these explicitly listed accounts can access either workout profile.

5. In **Project Settings → API**, copy the Project URL and the **anon/public** key (or publishable key). Put them in `cloud-config.js`:

   ```js
   window.WORKOUT_CLOUD_CONFIG = {
     supabaseUrl: "https://your-project.supabase.co",
     supabaseAnonKey: "your-public-anon-or-publishable-key",
   };
   ```

   The anon/public key is designed to be included in a client app; access is restricted by the SQL row-level security policies. **Never put a service-role or secret key in this repository.**

6. Publish the updated site. Both people sign in on their own phone, then select Sean or Kick. Edits sync to the cloud and the other open device receives updates in real time. If both cloud and that device already have data for a profile, the app asks whether to use the cloud copy or replace it with that device's copy.

## Notes

- Initial migration uploads a device's local profile when no cloud copy exists. If a cloud copy already exists and local data differs, the choice dialog prevents accidental overwrite; it does not merge two different workout histories.
- When the network is unavailable, changes continue to save locally. They are sent to Supabase after connectivity returns or the next workout edit. Until the status says **Cloud synced**, those changes should be treated as device-only.
- If both phones edit the same profile at the same time, the most recently saved full profile replaces the earlier version. Avoid simultaneous editing of the same profile.
- Any of the two authorized accounts can view and edit both Sean and Kick profiles. Removing a person means deleting their row from `workout_sync_members` in the Supabase SQL Editor.
