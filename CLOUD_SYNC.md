# Cloud sync setup

The app can sync Sean and Kick's workout profiles between phones using Supabase. Without configuration, it continues to work in local-only mode and saves workouts in that browser's local storage.

Finishing stops the timer before generating proof and immediately starts a cloud save.
The device retains a pending completion record until that exact workout state is
acknowledged by the cloud. On reopening the profile, pending workouts take precedence
over stale cloud copies; other cloud workouts are preserved. Saves retry when the
profile loads, the connection returns, or the app returns to the foreground.

Renaming an exercise updates that exercise in later weeks of the same workout
template, using its shared plan ID. Earlier weeks and recorded set values remain
unchanged. Substitutions made after the template's first week are retained when
the profile is reloaded rather than reset to the original week's exercise name.

Workout plan edits (adding/removing exercises or sets, and renaming the workout)
mirror from the edited week. Matching exercises and sets retain their
logged values; newly added items start blank in later weeks. Deleting a workout
day removes that week and all later copies, and records the template's end week
so reopening does not recreate deleted days.

## Profile backups

Use **Download backup** to save a dated JSON file containing every workout week,
set value, technique note, timer, and plan setting for the selected user. Store it
outside the browser (for example in Files or iCloud Drive). Downloads are manual
and independent of finishing a workout.

**Restore backup** validates the file and requires the matching user profile.
It previews the date and workout count, then asks for confirmation before replacing
that profile's data locally and in the cloud. Download the current profile first
if you want to keep it. Restore records remain on the device until the cloud save
succeeds. Only data present on the device at download time is included; backups
cannot recover edits made after their date. Backups contain personal workout data,
not login credentials.

The **Refresh** button in the top bar reloads the selected user's saved cloud
profile (or device data in local-only mode), retaining the current workout/week
where possible. It refuses to replace data while a save is running or if edits
occur during the request. Connection failures leave the current data untouched.
Queued realtime updates are discarded when a local edit is saved, preventing an
older queued update from replacing that edit after focus leaves a field.

## Exercise targets

The red target icon beside BAIL opens read-only guidance for the selected week.
Targets come from `workout-targets.js`, imported from the supplied 12-week CSV
(the block column is ignored). Targets use the current week, workout day title
(Upper, Lower, Push, Pull or Leg/Legs day), and current exercise position, for
either profile. Exercise names and plan IDs are ignored. Deleting or adding an
exercise updates the positional mapping: a new seventh exercise receives slot
seven's targets. Unsupported days or positions show no available target.
The backup itself and its logged workout values are not included in the repository.

## Structural undo

Enabling LLP or MYO replaces its checkbox with the count input, keeping the
table uncluttered. Clearing the count and committing/leaving the field disables
the technique and restores the unchecked box; MYO also clears its local notes.
Shadow counts remain references and do not change the source workout.

Workout shadowing also displays the source day's session notes as placeholders.
Shadowing never adds or removes sets. Existing sets reference the corresponding
set number in the source exercise; manually added or re-added sets show that
number's shadow when available.
While shadowing, each set can show a theme-colored performance symbol beside LLP:
`>` for progress, `=` for unchanged performance, and `<` for decreased performance.
This compares the shadow day's logged set
against its own shadow source, or the same day in the immediately preceding week
if it has no shadow source. Symbols always describe the shadow's history, never
the current workout's performance. Finishing hides the symbols even when the
saved shadow link remains; resuming with shadow enabled shows them again.
Removing shadow also hides the symbols; workouts without shadowing show none. Weight
takes priority, then reps, then RPE (lower is better). Both sets must have valid
weight, reps and RPE; weight comparisons rank numeric entries above `BAR`
(bar weight), and `BAR` above `BW` (bodyweight), without assuming a bar's kilogram
weight. Numeric entries compare by amount. Comparisons ignore an `E` suffix
(each), so `7.5E` compares as `7.5`. Case and spacing around
these weight notations are ignored. Missing data and bailed exercises show no symbol.
They are references only: typing records notes for the current week without
changing the source, and clearing a local note reveals its shadow again.

The switch beside the structural-changes note disables forward mirroring for
manual edits, including day/exercise/set additions, deletions and renames.
While off, only the selected week changes. These local-only edits and deletions
remain local to that week on reload; turning the switch back on does not replay
them. Mirroring starts on again whenever the app is reloaded.

Set deletion requires confirmation, like deleting exercises and workout days.
The subtle **Undo** control left of the BAIL meter restores the last structural action
(adding, removing or renaming days/exercises/sets), after confirmation. A single
before/after record is held in memory for the current user session, including
data deleted from future weeks. Weight/rep/note edits do not replace that record.
Undo retains current logged data on surviving items and restores deleted items
from the snapshot; it refuses to overwrite conflicting later structure changes.
The restored state retries cloud sync until acknowledged. A new structural action
replaces the undo record; restoring a backup clears it. Undo history is not included
in downloadable backups or shared between devices. Logging out, switching users
or fully closing/reloading the app resets it. Pressing Undo with no action opens
a “Nothing to undo” message; otherwise the dialog names the action before confirmation.

## Color scheme

Click the SPIJKER TRACK logo to choose Red (the original theme), Magenta
(`#CC00CC`), Cyan (`#00C8FF`), Yellow (`#FFC30B`), Orange (`#FF6E00`) or
Lime (`#4CBB17`). Accents, focus outlines and tinted surfaces
use the selected palette. The preference is saved on this device, not in workout
profiles or backups. The logo opens this dialog without navigating away.

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

7. Publish the updated site and `cloud-config.js`. Both people sign in with their own Google account on their phone, then select Sean or Kick. Edits sync to the cloud and the other open device receives updates in real time. When a cloud copy exists, it is authoritative and replaces that device's local copy automatically. If no cloud copy exists yet, the device's local data is uploaded.

## Notes

- Initial migration uploads a device's local profile when no cloud copy exists. If a cloud copy already exists, selecting the profile replaces differing local data with the cloud copy; local-only changes on that device are not merged and will be lost.
- When the network is unavailable, changes continue to save locally. They are sent to Supabase after connectivity returns or the next workout edit. Until the status says **Cloud synced**, those changes should be treated as device-only.
- If both phones edit the same profile at the same time, the most recently saved full profile replaces the earlier version. Avoid simultaneous editing of the same profile.
- The top-bar Live BAIL meter totals bailed exercises across every saved workout for Sean and Kick and updates from cloud changes in real time. In local-only mode, the other profile's count is unavailable.
- Any of the two authorized accounts can view and edit both Sean and Kick profiles. Removing a person means deleting their row from `workout_sync_members` in the Supabase SQL Editor.
