type HelpSection = {
  title: string;
  paragraphs: string[];
  orderedItems?: string[];
  paragraphsHeading?: string;
};

export type HelpAudience = "admins" | "coaches" | "meet-coordinators" | "parents";

export type HelpPage = {
  id: string;
  title: string;
  audience: HelpAudience;
  sections: HelpSection[];
};

/**
 * Help content used by `/help`.
 *
 * Conventions:
 * - Navigation paths wrapped in square brackets are rendered in bold on the help UI.
 * - Content is written as paragraphs (no bullet lists) for a "guide" feel.
 */
export const HELP_PAGES: HelpPage[] = [
  {
    id: "coaches",
    title: "Coaches",
    audience: "coaches",
    sections: [
      {
        title: "Role overview",
        paragraphs: [
          "Coaches set up meets and keep rosters accurate. Strong roster data and clear setup lead to fair pairings, smooth mat flow, and reliable results [Rosters, Meets, Team Settings].",
          "Each team has one head coach and may have multiple assistant coaches. The head coach is the primary contact and serves as Meet Coordinator for home meets [Team Settings, Rosters, Meets].",
          "Head coaches create home meets for their own team [Meets]. Assistant coaches help run those meets, but Draft editing still depends on the Meet Coordinator granting access [Meet > Coordinator, Meet > Start Editing].",
          "During Attendance, the Meet Coordinator can edit attendance for every team, and other coaches can edit attendance for their own team. In Draft, attendance changes require the normal meet-editing lock. During Check-in, other team coaches need edit access from the Meet Coordinator before they can enter scratches for their own team, while the Meet Coordinator can manage scratches for any team and make replacement matches [Meet > Attendance, Meet > Scratches, Meet > Coordinator].",
          "Each team keeps a single head coach so meet ownership and coordinator duties stay clear.",
          "When several coaches work the same meet, agree on who is handling each phase. A common pattern is parent replies during Attendance, one coach building pairings in Draft, team coaches handling scratches in Check-in, and then everyone switching to read-only once the meet is published [Meet > Attendance, Meet > Pairings, Meet > Scratches, Meet > Publish].",
        ],
      },
      {
        title: "First meet checklist",
        paragraphsHeading: "Tips",
        orderedItems: [
          "Verify roster data [Rosters].",
          "Check Team Settings [Team Settings, Team Settings > Meet Setup, Team Settings > Mat Setup].",
          "Create the meet [Meets > Create New Meet].",
          "Wait for parent attendance replies [Meet > Attendance].",
          "Wait for the attendance deadline, then close Attendance and enter Draft [Meet > Attendance].",
          "Generate and review pairings [Meet > Pairings].",
          "Assign mats and volunteers [Meet > Mat Assignments, Meet > Volunteers].",
          "Wait until the teams are at the gym, then move to Check-in [Meet > Checkpoints, Meet > Ready for Meet day].",
          "Print the Check-in sheets, have each team take attendance to determine who is a scratch, then have each team with coordinator-granted edit access enter its own scratches. After that, the Meet Coordinator finds new matches for wrestlers who lost bouts because of scratches and for kids who showed up unexpectedly [Meet > Check-in Sheets, Meet > Scratches].",
          "Publish the meet so parents can find their kids' bouts on their [My Wrestlers] page, then print the wall charts and scoring sheets [My Wrestlers, Meet > Publish, Meet > Wall Charts, Meet > Scoring Sheets].",
          "Start wrestling.",
        ],
        paragraphs: [
          "Before creating the meet, make sure active wrestlers have accurate weight, birthdate, experience, skill, and isGirl values. Then confirm Team Settings for match targets, rest gap, mat count, and mat rules. If those inputs are wrong, auto pairings and mat order will look wrong too [Rosters, Team Settings > Meet Setup, Team Settings > Mat Setup].",
          "When you create the meet, choose the away teams, date, location, attendance deadline, and number of mats. The meet starts in Attendance. Parents respond first, and coaches mainly review who is coming or not coming. Early and late flags are coach-side scheduling tools used later in Draft [Meets > Create New Meet, Meet > Attendance].",
          "After the deadline, click [Close Attendance] and do your real scheduling work in Draft. Clean up missing replies, then run Auto Pairings. Start with the system's suggestions, remove bad matchups, add manual ones when needed, and watch match counts so nobody is badly overbooked or left out [Meet > Attendance, Meet > Pairings].",
          "Once the bouts look right, go to Mat Assignments. Drag bouts to the right mats, use Reorder to improve rest time, and lock any bouts that should not move. If you are the home team, use Volunteers to place coaches, table workers, and parents on mats so the home side can follow its wrestlers [Meet > Mat Assignments, Meet > Volunteers].",
          "Before leaving Draft, make sure the meet is actually ready for Check-in. The system creates the Check-in checkpoint automatically when you move forward, so a first-time coach should think the meet is ready only when attending wrestlers mostly have bouts, obvious mismatch pairings are fixed, mats have a sensible order, and the home team can cover the gym [Meet > Checkpoints, Meet > Pairings, Meet > Mat Assignments, Meet > Volunteers].",
          "In Check-in, stop rebuilding the whole meet. Only the Meet Coordinator should be editing the meet itself at that point. Team coaches with coordinator-granted edit access use Scratches for their own team, while the Meet Coordinator handles cross-team adjustments, replacement bouts, and the final path to publish [Meet > Scratches, Meet > Publish].",
          "If anything feels off, do not keep improvising deeper into the workflow. Go back to the earlier input that drives it: roster data if pairings are strange, Team Settings if mat flow is poor, attendance if wrestlers are missing, or checkpoints if a large change made the meet worse [Rosters, Team Settings, Meet > Attendance, Meet > Checkpoints].",
        ],
      },
      {
        title: "Account and permissions",
        paragraphs: [
          "New accounts start as parents. Coaches can promote parents to assistant coaches or table workers for their team [Team Settings > Team Roles].",
          "Table workers enter bout results and keep mat sheets accurate. This is ideal for trusted volunteers who should not change pairings [Meets > Enter Results].",
          "Promote gradually: table worker for meet-day help, assistant coach for people you trust to adjust pairings and mat order [Team Settings > Team Roles].",
        ],
      },
      {
        title: "Team Settings",
        paragraphs: [
          "Team Settings centralizes team profile, meet defaults, mat layout, and roles [Team Settings]. Use the tabs to focus on one area at a time.",
          "Team Info updates website, home location, color, and logo for branding and printouts [Team Settings > Team Info].",
          "Meet Setup controls match limits, rest gap, and auto-pairing limits used when creating new meets [Team Settings > Meet Setup]. These defaults speed up meet creation.",
          "Mat Setup defines mat count, colors, and age or experience ranges for each mat [Team Settings > Mat Setup].",
          "Team Roles manages promotions and staff assignments [Team Settings > Team Roles].",
          "Use Rosters to add or import wrestlers and keep weights and active status current before each meet [Rosters].",
          "If pairings look odd, verify roster data first. Accurate weights, ages, and experience drive better recommendations [Rosters].",
        ],
      },
      {
        title: "Editing Your Roster",
        paragraphs: [
          "Update rosters before creating meets so the pairing engine has accurate weights, birthdates, experience, skill, and isGirl status for every wrestler [Rosters > Manage].",
          "The first row adds a new wrestler. Fill it in and click Add to create a pending entry [Rosters > Manage > Add].",
          "Click any cell to edit, then tab or click through the row.",
          "Edited rows are highlighted, and inactive wrestlers are shown with a strike-through. Use Show Inactive to view and edit inactive records, and use the active flag for temporary absences instead of deleting [Rosters > Manage].",
          "Delete only when a record should be removed permanently. Use inactive to preserve history [Rosters > Manage].",
          "Import supports XLSX or CSV. Use columns for first name, last name, weight, birthdate, experience, skill, and isGirl. Export downloads the current roster; import adds new wrestlers and updates existing records (matched by first + last name), and it never removes wrestlers [Rosters > Import]. Imports update weight, birthdate, experience, skill, and isGirl, but do not change active status. If the import would add more than 5 new wrestlers, the system asks for confirmation to prevent loading the wrong team.",
          "**Always click Save or Cancel** after editing so the highlights clear; unsaved edits remain highlighted as a reminder [Rosters > Manage].",
        ],
      },
      {
        title: "Creating a new meet",
        paragraphs: [
          "Go to [Meets] and choose [Create New Meet]. The home team's head coach creates the meet. Your team is already the home team, so you only choose the date, location, other teams, attendance deadline, and number of mats [Meets > Create New Meet].",
          "The create dialog also includes an option to allow other coaches to edit while the meet is in Draft. That pre-grants Draft lock access to the participating coaches, but the home-team head coach still remains the Meet Coordinator [Meets > Create New Meet, Meet > Coordinator].",
          "Meet setup defaults such as match targets, rest gap, and pairing rules come from [Team Settings > Meet Setup]. Review those before creating the meet if you want different pairing behavior.",
          "A newly created meet starts in the Attendance phase. Parents respond first, coaches review those replies, and then the meet moves into Draft when you click [Close Attendance] [Meet > Attendance].",
        ],
      },
      {
        title: "Meets page",
        paragraphs: [
          "The Meets page is split into [Active Meets] and [Published Meets]. Coaches see meets for their team [Meets].",
          "Active meets move through four phases: Attendance, Draft, Check-in, and Published. The status badge on each meet shows where the meet is in that workflow [Meets].",
          "Use View to open a meet. Edit actions are available only while the meet is still editable for your role. Published meets stay visible in their own card so families and staff can keep using the final schedule [Meets].",
          "Delete permanently removes a meet. Head coaches can delete their team's non-published meets [Meets].",
        ],
      },
      {
        title: "Meet phases and tabs",
        paragraphs: [
          "The meet header shows the current phase, last edit info, phase-change buttons, and lock controls when the lock matters [Meet > Start Editing, Meet > Release Lock].",
          "Attendance phase stays focused on parent replies, and the Attendance tab shows what parents have entered so far. Coaches can still make attendance changes there: the Meet Coordinator can edit every team, and other coaches can edit only their own team. The Pairings, Mat Assignments, and Volunteers tabs are hidden in this phase [Meet > Attendance].",
          "Draft is the working phase. Use Attendance to finish status changes, Pairings to build bouts, Mat Assignments to order bouts on mats, and Volunteers to place home-team staff on mats. Run automatic pairings only in Draft [Meet > Attendance, Meet > Pairings, Meet > Mat Assignments, Meet > Volunteers].",
          "Check-in is the live meet-day adjustment phase. The default tab is Scratches. Team coaches with coordinator-granted edit access can record scratches for their own team, while the Meet Coordinator can record scratches for any team and handle replacement matches and other cross-team changes. Volunteers is hidden in this phase, and the published wall-chart and scoring-sheet tabs are not shown until publishing [Meet > Scratches].",
          "Published is final. Publishing prepares the wall charts and scoring sheets and makes the meet read-only. A published meet cannot be reopened [Meet > Publish, Meet > Check-in Sheets, Meet > Scoring Sheets].",
        ],
      },
      {
        title: "Checkpoints",
        paragraphs: [
          "Checkpoints save the current state of meet attendance and scheduled bouts so you can roll back later [Meet > Checkpoints]. Each checkpoint stores attendance and all bouts with their mat assignments.",
          "The system also creates automatic checkpoints at key transitions. Closing Attendance saves an Attendance Closed checkpoint, and moving from Draft to Check-in saves a Check-in checkpoint that becomes the baseline for scratches and unexpected arrivals [Meet > Close Attendance, Meet > Ready for Meet day].",
          "Use Save to capture a manual snapshot before a major change. Use Show Changes to review what has changed since a checkpoint, and Apply to revert the meet to that saved state [Meet > Checkpoints].",
          "Only the Meet Coordinator can apply checkpoints, and Apply is hidden after publish. Applying a checkpoint restores attendance for active wrestlers, clears current bouts, and recreates the saved bouts. Wrestlers who were deleted or set inactive after the checkpoint are not re-matched, and newly added wrestlers will have zero matches after applying [Meet > Checkpoints].",
        ],
      },
      {
        title: "Attendance panel",
        paragraphs: [
          "Attendance is phase-aware. During Attendance, the Meet Coordinator can move wrestlers between the attendance lists for every team, while other coaches can edit only their own team while parent replies are still coming in [Meet > Attendance].",
          "In Draft, attendance changes require the normal meet-editing lock. The home-team coordinator and any coach with granted edit access can update attendance across the meet while holding the lock [Meet > Attendance, Meet > Start Editing, Meet > Coordinator].",
          "Coming keeps the wrestler eligible for pairings. Not Coming removes the wrestler from pairing suggestions and deletes that wrestler's current bouts. Arrive Late and Leave Early keep the wrestler attending, but mark them so mat order can be adjusted around them. Coaches can set those flags from Attendance, and in Draft they are also available from Pairings and Mat Assignments [Meet > Attendance, Meet > Mat Assignments].",
          "Right click a wrestler in Pairings or Mat Assignments during Draft to mark Arrive Late or Leave Early quickly. The Not Attending option appears there only in Draft [Meet > Pairings, Meet > Mat Assignments].",
          "No Reply remains distinct from Not Coming. In Draft, the Not Coming column also shows No Reply wrestlers so coaches can clean them up before pairings are finalized [Meet > Attendance].",
        ],
      },
      {
        title: "Locks and collaboration",
        paragraphs: [
          "The meet lock is mainly for Draft pairings and mat work. Click Edit on the Meets list or Start Editing inside a meet to request the lock and become the active editor until you release it [Meets > Edit, Meet > Start Editing, Meet > Release Lock].",
          "If another coach holds the lock, you will see their username. You can still view the meet in read-only mode and use comments to coordinate handoffs [Meet > Comments].",
          "The lock is not used for every workflow. During Attendance, the Meet Coordinator can edit every team and other coaches can edit their own team. During Check-in, coaches who were granted edit access can enter scratches for their own team without the lock [Meet > Attendance, Meet > Scratches].",
          "Outside Draft, editing is much tighter. After the meet leaves Draft, only the Meet Coordinator edits the meet itself, while team coaches keep only the team-specific Check-in scratch tools [Meet > Coordinator, Meet > Scratches].",
          "Locks expire if they are not refreshed. The timeout is 2 minutes, so the lock clears if the tab closes, the device sleeps, the network drops, the page is backgrounded, or the session expires.",
          "The app also releases your lock after inactivity. The inactivity timer is 5 minutes, and you will see a countdown near the top of the meet page. Move the mouse, click, or tap to reset it.",
        ],
      },
      {
        title: "Pairings and fairness",
        paragraphs: [
          "Start with automatic pairings, then review and adjust [Meet > Pairings]. The goal is fair, safe, and realistic matchups, not a perfect mathematical result.",
          "Weight, age, experience, and skill are the primary matching factors. With accurate roster data, the top suggestions are usually strong starting points, but coaches should still apply judgment [Rosters, Meet > Pairings].",
          "The Delta column shows the weight percentage difference between wrestlers, biased by age, experience, and skill. Values closer to zero are tighter matches; a positive value favors the first wrestler and a negative value favors the second [Meet > Pairings].",
          "Use Girls wrestle girls and the other pairing filters to tighten or loosen suggestions during review [Meet > Pairings].",
          "League-wide pairing fairness settings affect new pairing suggestions; existing bouts keep their saved scores until you regenerate pairings [Meet > Pairings].",
          "Run Auto Pairings is available only in Draft. The dialog can clear current bouts first or keep them, depending on the Clear existing bouts option [Meet > Pairings].",
          "The prune step after auto pairings removes bouts where both wrestlers are above the target match count. Use that to trim extras while keeping low-match wrestlers covered [Meet > Pairings].",
          "Removing a bout marks that matchup as rejected for the meet. Rejected matchups show a badge in Additional Matches and will not be recreated by auto pairings unless you enable Allow previously rejected matchups in the run dialog [Meet > Pairings].",
          "Use the additional matches list to add or remove bouts [Meet > Pairings > Additional Matches]. Enforce weight checks when required and document exceptions in comments [Meet > Comments].",
          "Use rest gap settings to avoid scheduling the same wrestler too close together. This improves pacing, especially in multi-mat meets [Team Settings > Meet Setup, Meet > Pairings].",
          "Watch match counts to spread opportunities evenly and avoid overbooking any wrestler [Meet > Pairings].",
        ],
      },
      {
        title: "Mat assignments",
        paragraphs: [
          "Mat Assignments is the running order for the gym. Drag and drop bouts to balance mats or group divisions or teams when your format requires it [Meet > Mat Assignments].",
          "Use bout locks to hold matches in place when you reorder. Click on a bout number to lock or unlock that bout, and use Lock All or Unlock All on a mat to lock or unlock all bouts [Meet > Mat Assignments].",
          "Use Reorder on a single mat or Reorder All to improve rest time between bouts based on the rest gap setting. It is most useful after major pairing edits or large mat moves [Meet > Mat Assignments].",
          "Reorder only moves unlocked bouts. If every bout on a mat is locked, Reorder is disabled for that mat until at least one bout is unlocked [Meet > Mat Assignments].",
          "The Show team toggle stays with you as you move between tabs, which makes it easier to review team-heavy layouts. Wrestlers with only one match are always shown in italics on this page [Meet > Mat Assignments].",
          "Confirm each mat has a sensible flow and coaches can cover their wrestlers. If you make major changes close to start time, communicate them and reprint affected sheets [Meet > Comments].",
        ],
      },
      {
        title: "Volunteers tab",
        paragraphs: [
          "Use Volunteers to assign home-team staff to mats so families and helpers can follow their wrestlers more easily [Meet > Volunteers].",
          "The tab is available only to home-team coaches. It lists home-team coaches, table workers, and parents, including linked kids, and lets you drag each person to a mat or back to Unassigned [Meet > Volunteers, Team Settings > Team Roles].",
          "Volunteers is available during Draft and remains viewable after publish. It is hidden during Attendance and Check-in because those phases focus on parent responses and scratches instead [Meet > Attendance, Meet > Scratches, Meet > Volunteers].",
          "Volunteer mat assignments can be changed only in Draft while you hold edit lock. After publish the page stays visible, but the assignments are read-only [Meet > Start Editing, Meet > Publish].",
          "Use the Unassigned search box to filter immediately as you type by volunteer name, role, or kid name during fast meet-day changes [Meet > Volunteers].",
          "Each volunteer card shows each kid with bout-number badges. A normal badge means that bout is already on the volunteer's mat, red means the bout is on a different mat, and yellow means the kid has parents assigned to different mats [Meet > Volunteers].",
          "Click a volunteer card with mismatched bouts to move that volunteer's kids to that volunteer's mat. Use Move all at the top to move all pending mismatches at once; it is enabled only when there are matches to move, and the toolbar shows the current count [Meet > Volunteers].",
          "For multi-parent conflicts, Move all does not move a bout if it is already on one of that kid's parent mats. Yellow conflict badges mark these cases so you can choose the target by clicking the specific parent card [Meet > Volunteers].",
        ],
      },
      {
        title: "Printing and sharing",
        paragraphs: [
          "Plan prints around stability. Check-in sheets are useful before or during Check-in, while wall charts and scoring sheets are created as part of publishing and should be printed after the schedule is final [Meet > Check-in Sheets, Meet > Wall Charts, Meet > Scoring Sheets].",
          "Use Checkpoints, then Export to .wrs, to download a zip with the legacy Pairings2010 files (.wrs, .web.xml, .excel.xml, and pairings.xsl). This helps coaches who still use the old program and provides an archival backup [Meet > Checkpoints].",
        ],
      },
      {
        title: "Running the meet",
        paragraphs: [
          "A good meet flow is simple: review parent replies in Attendance, build and clean up bouts in Draft, handle no-shows and unexpected arrivals in Check-in, then publish once the schedule is final [Meet > Attendance, Meet > Pairings, Meet > Scratches, Meet > Publish].",
          "During Check-in, use the Scratches modal for each team and mark that team Done when finished. Team coaches with coordinator-granted edit access should limit themselves to their own team's scratches. The Meet Coordinator handles unexpected arrivals, replacement bouts, and any edits that affect the overall meet [Meet > Scratches].",
          "If mat order shifts due to delays or substitutions before publish, update the plan and reprint affected sheets. Once the meet is published, treat the digital schedule as final and handle later changes on paper [Meet > Mat Assignments, Meet > Publish].",
        ],
      },
      {
        title: "Best practices for meet preparation",
        paragraphs: [
          "Start early by verifying roster data and making corrections. Update weights, birthdates, experience, and skill so matching suggestions reflect reality. Accurate data matters more than complex settings [Rosters].",
          "Before you generate or review pairings, confirm your mat plan. Set mat count, colors, and age or experience ranges so coaches can cover the right wrestlers and table workers stay organized. A common best practice is a rest gap of about 6 matches [Team Settings > Mat Setup, Team Settings > Meet Setup].",
          "After auto pairings, scan for outliers and edge cases. Look for unusual age or weight combinations, verify high-skill matchups, and identify wrestlers who may need manual attention. Coordinate changes early to avoid last-minute reshuffling [Meet > Pairings, Meet > Comments].",
          "When the plan looks solid, hand off clearly. Use comments to document major decisions, release the lock for another review, and publish only when the meet should be treated as stable [Meet > Comments, Meet > Release Lock, Meet > Publish].",
        ],
      },
      {
        title: "Results entry",
        paragraphs: [
          "Enter results as bouts finish and confirm winners and result details [Meets > Enter Results]. Accurate results prevent duplicate work and simplify reporting later.",
          "If multiple people enter results, assign mats so two people are not entering the same bout. The goal is speed and accuracy [Meets > Enter Results].",
          "Before final reporting, scan for missing results so the data is complete. Use results for standings or summaries as required by your league [Meets > Enter Results].",
        ],
      },
      {
        title: "Troubleshooting",
        paragraphs: [
          "If you cannot edit a meet, check whether another coach holds the lock or you are in read-only mode. Start Editing shows who has the lock and when it expires [Meet > Start Editing].",
          "If a Draft attendance save says lock is required, that is expected. In Draft, attendance changes use the normal meet-editing lock; no-lock attendance edits are only available during the Attendance phase [Meet > Attendance].",
          "If scratches or unexpected arrivals are missing in Check-in, confirm a Check-in checkpoint exists and that the team has not already been marked done by someone else. Use the Refresh button in Scratches to pick up other coaches' updates, and remember that team coaches can enter scratches only for their own team when they have coordinator-granted access, while the Meet Coordinator handles replacement matches and other cross-team changes [Meet > Scratches, Meet > Checkpoints].",
          "If a wrestler is missing, confirm they are active on the roster and that their data is complete [Rosters]. Pairing quality depends on accurate age, weight, and experience values.",
          "If rest time between bouts looks tight or prints look wrong, review rest gap, match limits, and mat order, then reprint [Team Settings > Meet Setup, Meet > Mat Assignments, Meet > Wall Charts]. Use comments to coordinate with other coaches and table staff.",
        ],
      },
    ],
  },
  {
    id: "admins",
    title: "Admins",
    audience: "admins",
    sections: [
      {
        title: "Role overview",
        paragraphs: [
          "Admins manage league-wide settings, onboarding, and access control from [Admin > League], [Admin > Teams], [Admin > Pairings Settings], and [Admin > Users]. This role keeps the season organized.",
          "Admin access should focus on setup, oversight, and troubleshooting so coaches can run day-to-day meet workflows without surprises. Use [Admin > Users] for role issues and [Admin > League] or [Admin > Teams] for structural changes.",
          "Admins can create and edit teams and rosters for every team, which helps with onboarding, corrections, and emergency fixes [Admin > Teams, Rosters].",
          "Admins can also create and edit meets when needed for oversight, corrections, or shared league events [Meets].",
          "A good season kickoff checklist is league branding, teams created, head coach assigned for every team, and users verified with correct roles and team assignments [Admin > League, Admin > Teams, Admin > Users].",
        ],
      },
      {
        title: "League setup",
        paragraphs: [
          "Start by setting the league name, logo, website, and branding so printouts and screens are consistent across teams [Admin > League]. These details help families and staff recognize official materials.",
          "Create a team record for each club or school and set names and symbols so teams are easy to recognize on screens and printouts [Admin > Teams].",
          "Set team colors and upload team logos for readability. Colors and logos appear throughout the site and help families and staff identify teams at a glance [Admin > Teams].",
          "Assign a head coach to each team so every team has a primary contact and someone responsible for coordination [Admin > Teams, Admin > Users].",
          "If a team does not already have a head coach, the first coach assigned becomes the head coach automatically [Admin > Users].",
          "Head coach remains a team designation and also serves as Meet Coordinator for home meets, including deciding which assistant coaches have edit access [Admin > Users, Meets].",
          "Use the Teams table to upload logos, update details, and remove teams when necessary. Deleting a team is destructive, so use it only when you are sure it should be removed [Admin > Teams].",
        ],
      },
      {
        title: "Export, import, and new year reset",
        paragraphs: [
          "Use export to back up teams and rosters before major changes or at season end [Admin > Teams > Export Teams + Rosters]. Save the zip file somewhere safe.",
          "Use import to restore teams and rosters from a prior export or a league-provided file [Admin > Teams > Import Teams + Rosters]. Import clears existing rosters first, so confirm you have a backup before proceeding.",
          "Import and reset require typing a confirmation word. This is intentional because these actions are destructive and difficult to undo [Admin > Teams, Admin > League].",
          "Use the new year reset when you are ready to clear all meets and rosters for a fresh season [Admin > League > Reset For New Year]. This permanently deletes all accounts except admins and head coaches, so do it only after exporting what you want to keep.",
        ],
      },
      {
        title: "User access and support",
        paragraphs: [
          "New accounts begin with a parent role. Parents can view team information but do not have editing permissions by default, and you can confirm this on [Admin > Users].",
          "Coaches can promote parents to assistant coaches or table workers [Team Settings > Team Roles]. Admins can also resolve role issues or correct team assignments from [Admin > Users].",
          "If a meet is blocked by access problems, confirm the user role and team assignment on [Admin > Users], then confirm lock status on the meet page using Start Editing [Meet > Start Editing].",
          "Admins can promote other users to admin when additional league oversight is needed [Admin > Users]. There must always be at least one admin, so the last remaining admin cannot be removed.",
          "Keep team assignments clean. Coaches, parents, and table workers should be assigned to a team so the site shows the right rosters and meets. Admins keep league-wide access regardless of team assignment [Admin > Users].",
        ],
      },
      {
        title: "User management",
        paragraphs: [
          "Use the user list to search, filter by team, and page through accounts [Admin > Users]. This helps you locate coaches, parents, and table workers quickly.",
          "Create new users with their username, contact info, role, and team assignment [Admin > Users > Create New User]. This is useful for onboarding staff who have not signed up yet.",
          "Update roles and team assignments directly in the user table [Admin > Users]. If a coach changes teams mid-season, update their team assignment so they see the correct meets and rosters.",
          "Reset passwords when needed and delete accounts that should no longer have access [Admin > Users]. You cannot delete your own account or remove the last remaining admin.",
        ],
      },
      {
        title: "Governance and oversight",
        paragraphs: [
          "Admins should avoid routine meet editing unless asked so coaches can keep control of their workflow. Step in when there is a dispute, a technical issue, or a need for cross-team coordination [Meets].",
          "Use your access to review data quality, promote consistency across teams, and support first-time users with training or documentation [Admin > League, Admin > Teams, Admin > Users].",
          "When someone reports missing meets or missing editing access, check role, team assignment, and meet status. Draft is the main working phase, Check-in has separate scratch permissions, and Published is final and cannot be reopened [Admin > Users, Meets].",
        ],
      },
    ],
  },
  {
    id: "meet-coordinators",
    title: "Meet Coordinators",
    audience: "meet-coordinators",
    sections: [
      {
        title: "Role overview",
        paragraphs: [
          "The Meet Coordinator is the head coach of the home team for that meet. This person controls who can start editing and is the default owner of editing access [Meet > Coordinator, Meet > Start Editing].",
          "The coordinator role is assigned through the home team's head coach. If the home team head coach changes, coordinator responsibilities follow that head coach assignment.",
          "Assistant coaches can still build pairings, adjust mat order, and enter changes, but lock-based editing after Attendance depends on the coordinator granting access for that meet [Meet > Coordinator, Meet > Start Editing].",
          "The coordinator also controls the phase transitions that matter most: moving from Draft into Check-in, publishing the meet, and applying checkpoints [Meet > Ready for Meet day, Meet > Publish, Meet > Checkpoints].",
        ],
      },
      {
        title: "Grant edit access",
        paragraphs: [
          "Open a meet and use the [Coordinator] button in the header to open Grant Edit Access. This is how you allow other coaches to help schedule matches and work on the meet in Draft. Select exactly which coaches should be allowed to edit that meet [Meet > Coordinator].",
          "Use team-level All or None to quickly grant or remove access for one team, and use Everyone or Only me for quick global changes across eligible coaches [Meet > Coordinator].",
          "The Meet Coordinator always keeps access and is not listed as a selectable coach. Click Done to save and close after reviewing selections [Meet > Coordinator].",
          "If you remove a coach's access, that coach stops being able to keep helping with match scheduling and other Draft edits for that meet [Meet > Coordinator].",
          "Grant edit access controls who can help with Draft editing. It also controls which coaches may enter their own team's scratches during Check-in. It does not affect Attendance-phase own-team attendance edits, and it does not bypass the normal meet lock for Draft attendance changes [Meet > Attendance, Meet > Scratches].",
        ],
      },
      {
        title: "Lock workflow",
        paragraphs: [
          "Granting access allows a coach to click Start Editing. It does not bypass the lock itself; only one person can hold the lock at a time [Meet > Start Editing].",
          "Use a clear handoff rhythm: one coach edits, saves, and releases lock, then the next coach starts editing. This prevents collisions during pairings and mat reordering [Meet > Release Lock, Meet > Comments].",
          "When coaches report read-only access, confirm they were granted access and that no one else currently holds the lock [Meet > Coordinator, Meet > Start Editing].",
        ],
      },
      {
        title: "Create meet defaults",
        paragraphs: [
          "During meet creation, the [Allow other coaches to edit while the meet is in Draft phase] option pre-grants Draft lock access to the participating coaches except the coordinator, who is always allowed [Meets > Create New Meet].",
          "If you leave that option off, only the coordinator can start lock-based Draft editing until access is granted manually from the meet header [Meet > Coordinator].",
        ],
      },
      {
        title: "Troubleshooting",
        paragraphs: [
          "If Grant Edit Access is unavailable with a warning about assignment, make sure the home team has a head coach assigned, then reopen the meet. If that assignment is missing or wrong, ask an admin for help before trying again [Meet > Coordinator].",
          "If a coach gets the message that the coordinator has not granted edit access, confirm they are a coach on one of the meet teams and then add them in Grant Edit Access [Meet > Coordinator, Meet > Start Editing].",
          "If a team says it cannot complete Check-in, remember that team coaches do not need the meet lock for scratch entry, but they do need coordinator-granted edit access and must be working on their own team. The Meet Coordinator handles replacement matches and cross-team changes during Check-in [Meet > Scratches].",
          "If coordination breaks down during live changes, use comments and explicit lock handoffs so all coaches and table workers know when the plan changed [Meet > Comments].",
        ],
      },
    ],
  },
  {
    id: "parents",
    title: "Parents",
    audience: "parents",
    sections: [
      {
        title: "Role overview",
        paragraphs: [
          "Parent accounts may be created by you or by a coach on your behalf. Parent accounts can link wrestlers, reply to attendance requests before the deadline, view upcoming meet information, and see bout numbers once they are available, but cannot edit team data by default [Sign Up, My Wrestlers, Attendance, Today].",
          "If you need to help run a meet, ask a coach to promote you to assistant coach or table worker. Table worker access is designed for volunteers who record results [Team Settings > Team Roles].",
        ],
      },
      {
        title: "My Wrestlers page",
        paragraphs: [
          "My Wrestlers is your main parent dashboard [My Wrestlers]. Use Select Wrestlers to link the wrestlers on your team that belong to your family. The page can suggest wrestlers based on last-name matching, but you should confirm the selection before applying it.",
          "After your wrestlers are linked, My Wrestlers shows today's meet cards, upcoming attendance cards, your linked wrestlers' basic info, and match history from past meets [My Wrestlers, Today].",
          "When bout numbers and opponents are available, My Wrestlers shows them for your linked wrestlers. Before that, you may see attendance or check-in information instead of final bout assignments [My Wrestlers].",
        ],
      },
      {
        title: "Attendance replies",
        paragraphs: [
          "Use the Attendance page before the deadline while the reply buttons are still available [Attendance]. Parents can reply only Coming or Not Coming.",
          "After the deadline passes, or once parent replies are closed, parents can no longer change attendance in the app. At that point the page shows the current saved response and tells you to contact your coach if something changed [Attendance].",
          "If we do not hear from you before the deadline, coaches treat that as not coming when they clean up attendance for scheduling [Attendance].",
        ],
      },
      {
        title: "Today page",
        paragraphs: [
          "Use Today for day-of meet information [Today]. It shows your linked wrestlers in meets happening today or later once meet-day details are available.",
          "Today may show check-in status before bout numbers are available. You may see messages that coaches are checking in wrestlers, badges such as Checked In or Scratched, and a warning to find a coach right away if your wrestler is marked scratched but is actually at the gym [Today].",
          "If you are a home-team volunteer with a mat assignment, Today also shows which mat you are assigned to help on [Today].",
        ],
      },
      {
        title: "What a table worker does",
        paragraphs: [
          "A table worker tracks bout results at a mat and keeps the bout sheet accurate. This role is essential for keeping the event moving and reporting accurate results [Meets > Enter Results].",
          "Table workers focus on recording scores, winners, and bout order updates. They do not edit pairings or roster data unless given a coaching role [Meets > Enter Results].",
          "If you are a table worker, coordinate with the head coach on which mat you are responsible for and how changes will be communicated. Most meet-day confusion comes from outdated paper, so confirm you are using the latest plan.",
        ],
      },
      {
        title: "Meet day expectations",
        paragraphs: [
          "Parents are expected to reply before the attendance deadline. On meet day, each team checks in wrestlers at the gym to confirm who is really present, and coaches use that to handle scratches and replacement matches [Attendance, Today].",
          "Once bout numbers are available, parents can find them on My Wrestlers and Today [My Wrestlers, Today]. Those bout numbers match the printed wall charts and scoring sheets.",
          "If something looks incorrect on meet day, bring it to a coach or table worker right away [My Wrestlers, Today].",
        ],
      },
      {
        title: "Working with coaches",
        paragraphs: [
          "Coaches may share instructions for attendance deadlines, weigh-ins, gym check-in, or volunteer assignments. Use the Attendance page before the deadline and ask your coach if you are unsure which action is expected [Attendance, Help].",
          "If you are promoted to table worker, focus only on entering results accurately and quickly [Meets > Enter Results].",
        ],
      },
    ],
  },
];
