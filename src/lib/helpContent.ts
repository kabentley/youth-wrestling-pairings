type HelpSection = {
  title: string;
  paragraphs: string[];
};

type HelpPage = {
  id: string;
  title: string;
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
    sections: [
      {
        title: "Role overview",
        paragraphs: [
          "Coaches set up meets and keep rosters accurate. Strong roster data and clear setup lead to fair pairings, smooth mat flow, and reliable results [Rosters, Meets, Team Settings].",
          "Each team has one head coach [Admin > League & Teams > Teams] and may have multiple assistant coaches. The head coach is the primary contact, while assistant coaches have the same day-to-day permissions [Team Settings, Rosters, Meets].",
          "Coaches can create and edit meets and adjust team and mat settings for their team [Meets, Team Settings]. Assistant coaches can also take the lock during specific phases [Team Settings > Team Roles].",
          "Head coach is a continuity label, not a special permission set. Only admins can change the head coach, and each team keeps a single head coach for clarity [Admin > Users, Admin > League & Teams].",
          "When several coaches work the same meet, agree on who holds the lock by phase. One coach can build pairings while another reviews read-only, then hand off the lock for mat order or results [Meet > Start Editing, Meet > Release Lock, Meet > Comments].",
        ],
      },
      {
        title: "Account and permissions",
        paragraphs: [
          "New accounts start as parents. Head coaches can promote parents to assistant coaches or table workers for their team [Team Settings > Team Roles].",
          "Table workers enter bout results and keep mat sheets accurate. This is ideal for trusted volunteers who should not change pairings [Results > select meet].",
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
          "Use Rosters to add or import wrestlers and keep weights and availability current before each meet [Rosters].",
          "If pairings look odd, verify roster data first. Accurate weights, ages, and experience drive better recommendations [Rosters].",
        ],
      },
      {
        title: "Editing Your Roster",
        paragraphs: [
          "Update rosters before creating meets so the pairing engine has accurate weights, birthdates, experience, skills, and active status for every wrestler [Rosters > Manage].",
          "The first row adds a new wrestler. Fill it in and click Add to create a pending entry [Rosters > Manage > Add].",
          "Click any cell to edit, then tab or click through the row.",
          "Edited rows are highlighted, and inactive wrestlers are shown with a strike-through. Use Show Inactive to view and edit inactive records, and use the active flag for temporary absences instead of deleting [Rosters > Manage].",
          "Delete only when a record should be removed permanently. Use inactive to preserve history [Rosters > Manage].",
          "Import supports XLSX or CSV. Use columns for first name, last name, weight, birthdate, experience, and skill. Export downloads the current roster; import adds new wrestlers and updates existing records (matched by first + last name), and it never removes wrestlers [Rosters > Import]. Imports update weight, birthdate, experience, and skill, but do not change active status. If the import would add more than 5 new wrestlers, the system asks for confirmation to prevent loading the wrong team.",
          "**Always click Save or Cancel** after editing so the highlights clear; unsaved edits remain highlighted as a reminder [Rosters > Manage].",
        ],
      },
      {
        title: "Creating a new meet",
        paragraphs: [
          "Go to [Meets] and choose [New Meet]. Enter the meet name and date, then select the other teams. Your team is always included.",
          "The home team drives defaults for mats and pairing preferences. By default it is the team of the coach who created the meet; only admins can change it [Admin > Users].",
          "Set the number of mats and the target matches per wrestler; these shape layout and auto-pairing output [Meets > New Meet].",
          "Review match limits, rest gap, and auto-pairing limits before saving; these settings drive fairness and pacing [Team Settings > Meet Setup, Meet > Pairings].",
          "Click Create Meet to open the draft in edit mode and confirm attendance before pairings run [Meet > Pairings].",
          "Attendance always comes first. Use Generate Automatic Pairings when creating the meet if you want auto pairings to run after attendance; otherwise you can keep manual pairings [Meet > Pairings].",
        ],
      },
      {
        title: "Meets page",
        paragraphs: [
          "The Meets page lists meets by date with name, date, location, team symbols, and status [Meets]. Coaches see meets for their team; admins see all meets.",
          "Use View to open, Edit for edit mode, and Delete to remove a meet. The list also shows last edit info and a Restore Deleted option when there are deleted meets [Meets].",
          "Create New Meet opens the setup dialog for name/date/teams and settings like mats and target matches. You can select up to three other teams; your team is always included [Meets > New Meet].",
          "Draft means the meet is still in setup and supports full editing with the lock.",
          "Published means the plan is ready to share; you can reopen as draft if changes are needed [Meet > Publish].",
        ],
      },
      {
        title: "Meet page tabs",
        paragraphs: [
          "The meet header shows status, last edit info, and lock controls. Use Edit or Start Editing to request the lock before changing anything [Meet > Edit, Meet > Start Editing].",
          "Pairings is for assigning bouts. Mat Assignments sets the mat and order. Wall Charts is a visual overview for checking balance and printing [Meet > Pairings, Meet > Mat Assignments, Meet > Wall Charts].",
        ],
      },
      {
        title: "Checkpoints",
        paragraphs: [
          "Checkpoints save the current state of meet attendance and scheduled bouts so you can roll back later [Meet > Checkpoints]. Each checkpoint stores attendance and all bouts with their mat assignments.",
          "Use Save to capture a snapshot before a major change. Use Show Changes to review what has changed since a checkpoint, and Apply to revert the meet to that saved state [Meet > Checkpoints].",
          "Applying a checkpoint restores attendance for active wrestlers, clears current bouts, and recreates the saved bouts. Wrestlers who were deleted or set inactive after the checkpoint are not re-matched, and newly added wrestlers will have zero matches after applying [Meet > Checkpoints].",
          "Checkpoints only apply when the same teams are in the meet. If the team list changes, the checkpoint will not apply.",
        ],
      },
      {
        title: "Attendance panel",
        paragraphs: [
          "Use Attendance to mark availability before fine-tuning pairings. In Pairings, click Attendance; you must hold the lock to edit [Meet > Start Editing, Meet > Pairings].",
          "Coming is the default. Not Coming removes the wrestler from pairing suggestions and deletes existing bouts for that wrestler.",
          "Arrive Late and Leave Early are planning flags. The wrestler still wrestles, but their name is highlighted so you can adjust bout order in Mat Assignments [Meet > Mat Assignments].",
          "Right click a wrestler in the Pairings roster list to mark Not Coming, Arrive Late, or Leave Early without opening the attendance dialog [Meet > Pairings].",
          "Best practice: update attendance first, then run auto pairings to fill gaps and refresh recommendations [Meet > Pairings].",
        ],
      },
      {
        title: "Locks and collaboration",
        paragraphs: [
          "Each meet has a lock so only one coach can edit at a time. Click Edit on the Meets list or Start Editing inside a meet to request the lock and become the active editor until you release it [Meets > Edit, Meet > Start Editing, Meet > Release Lock].",
          "If another coach holds the lock, you will see their username. You can still view the meet in read-only mode and use comments to coordinate handoffs [Meet > Comments].",
          "Locks prevent conflicts such as one coach reordering mats while another adds bouts. Use a simple rhythm: edit, save, communicate, release [Meet > Comments].",
          "Locks expire if they are not refreshed. The timeout is 2 minutes, so the lock clears if the tab closes, the device sleeps, the network drops, the page is backgrounded, or the session expires.",
          "The app also releases your lock after inactivity. The inactivity timer is 5 minutes, and you will see a countdown near the top of the meet page. Move the mouse, click, or tap to reset it.",
        ],
      },
      {
        title: "Pairings and fairness",
        paragraphs: [
          "Start with automatic pairings, then review and adjust [Meet > Pairings]. The goal is fair, safe, and realistic matchups, not a perfect mathematical result.",
          "Weight, age, experience, and skill are the primary matching factors. With accurate roster data, the top suggestions are usually strong starting points, but coaches should still apply judgment [Rosters, Meet > Pairings].",
          "The Δ column shows the weight percentage difference between wrestlers, biased by age, experience, and skill. Values closer to zero are tighter matches; a positive value favors the first wrestler and a negative value favors the second [Meet > Pairings].",
          "Pairings fairness settings live in the admin Pairings Settings tab and apply immediately to new pairing suggestions; existing bouts keep their saved scores until you regenerate pairings [Admin > Pairings Settings, Meet > Pairings].",
          "Run Auto Pairings can clear current bouts or keep them, depending on the Clear existing bouts option in the dialog [Meet > Pairings].",
          "Use the additional matches list to add or remove bouts [Meet > Pairings > Additional Matches]. Enforce weight checks when required and document exceptions in comments [Meet > Comments].",
          "Use rest gap settings to avoid scheduling the same wrestler too close together. This improves pacing, especially in multi-mat meets [Team Settings > Meet Setup, Meet > Pairings].",
          "Watch match counts to spread opportunities evenly and avoid overbooking any wrestler [Meet > Pairings].",
        ],
      },
      {
        title: "Mat assignments",
        paragraphs: [
          "Mat Assignments is the running order for the gym. Drag and drop bouts to balance mats or group divisions or teams when your format requires it [Meet > Mat Assignments].",
          "Use Reorder to improve rest time between bouts based on the rest gap setting. It is most useful after major pairing edits or large mat moves [Meet > Mat Assignments].",
          "Confirm each mat has a sensible flow and coaches can cover their wrestlers. If you make major changes close to start time, communicate them and reprint affected sheets [Meet > Comments].",
        ],
      },
      {
        title: "Printing and sharing",
        paragraphs: [
          "Plan prints around stability. Rosters are best printed early for check-in and weigh-ins, while wall charts and mat sheets should be printed after mat order is stable [Meet > Wall Charts].",
          "If pairings or mat assignments change, assume any paper already handed out is outdated. Communicate changes and reprint what table workers and coaches will reference [Meet > Comments].",
          "Use Export Meet on the Pairings card to download a zip with the legacy Pairings2010 files (.wrs, .web.xml, .excel.xml, and pairings.xsl). This helps coaches who still use the old program and provides an archival backup [Meet > Pairings].",
        ],
      },
      {
        title: "Running the meet",
        paragraphs: [
          "Confirm weigh-ins are complete before final pairing changes [Meet > Pairings]. Assign a coach or table worker to keep results entry current as bouts finish [Results].",
          "If mat order shifts due to delays or substitutions, update the plan and reprint affected sheets [Meet > Mat Assignments, Meet > Wall Charts]. Keep rosters updated if late scratches occur [Rosters].",
          "Keep the workflow simple. Make pairing changes only when necessary, communicate them clearly, and stabilize the plan so table workers and coaches can trust what they see [Meet > Comments].",
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
          "Enter results as bouts finish and confirm winners and result details [Results > select meet]. Accurate results prevent duplicate work and simplify reporting later.",
          "If multiple people enter results, assign mats so two people are not entering the same bout. The goal is speed and accuracy [Results].",
          "Before final reporting, scan for missing results so the data is complete. Use results for standings or summaries as required by your league [Results].",
        ],
      },
      {
        title: "Troubleshooting",
        paragraphs: [
          "If you cannot edit a meet, check whether another coach holds the lock or you are in read-only mode. Start Editing shows who has the lock and when it expires [Meet > Start Editing].",
          "If a wrestler is missing, confirm they are active on the roster and that their data is complete [Rosters]. Pairing quality depends on accurate age, weight, and experience values.",
          "If rest time between bouts looks tight or prints look wrong, review rest gap, match limits, and mat order, then reprint [Team Settings > Meet Setup, Meet > Mat Assignments, Meet > Wall Charts]. Use comments to coordinate with other coaches and table staff.",
        ],
      },
    ],
  },
  {
    id: "admins",
    title: "Admins",
    sections: [
      {
        title: "Role overview",
        paragraphs: [
          "Admins manage league-wide settings, onboarding, and access control from [Admin > League & Teams] and [Admin > Users]. This role keeps the season organized.",
          "Admin access should focus on setup, oversight, and troubleshooting so coaches can run day-to-day meet workflows without surprises. Use [Admin > Users] for role issues and [Admin > League & Teams] for structural changes.",
          "Admins can create and edit teams and rosters for every team, which helps with onboarding, corrections, and emergency fixes [Admin > League & Teams, Rosters].",
          "Admins can also create and edit meets when needed for oversight, corrections, or shared league events [Meets].",
          "A good season kickoff checklist is league branding, teams created, head coach assigned for every team, and users verified with correct roles and team assignments [Admin > League & Teams, Admin > Users].",
        ],
      },
      {
        title: "League setup",
        paragraphs: [
          "Start by setting the league name, logo, website, and branding so printouts and screens are consistent across teams [Admin > League & Teams > League]. These details help families and staff recognize official materials.",
          "Create a team record for each club or school and set names and symbols so teams are easy to recognize on screens and printouts [Admin > League & Teams > Teams].",
          "Set team colors and upload team logos for readability. Colors and logos appear throughout the site and help families and staff identify teams at a glance [Admin > League & Teams > Teams].",
          "Assign a head coach to each team so every team has a primary contact and someone responsible for coordination [Admin > League & Teams > Teams, Admin > Users].",
          "If a team does not already have a head coach, the first coach assigned becomes the head coach automatically [Admin > Users].",
          "Head coach is a designation, not a separate permission level. Day-to-day, all coaches have the same capabilities, but the label helps with ownership and continuity [Admin > Users].",
          "Use the Teams table to upload logos, update details, and remove teams when necessary. Deleting a team is destructive, so use it only when you are sure it should be removed [Admin > League & Teams > Teams].",
        ],
      },
      {
        title: "Export, import, and new year reset",
        paragraphs: [
          "Use export to back up teams and rosters before major changes or at season end [Admin > League & Teams > Export Teams + Rosters]. Save the zip file somewhere safe.",
          "Use import to restore teams and rosters from a prior export or a league-provided file [Admin > League & Teams > Import Teams + Rosters]. Import clears existing rosters first, so confirm you have a backup before proceeding.",
          "Import and reset require typing a confirmation word. This is intentional because these actions are destructive and difficult to undo [Admin > League & Teams].",
          "Use the new year reset when you are ready to clear all meets and rosters for a fresh season [Admin > League & Teams > Reset For New Year]. This is permanent and should be done only after exporting what you want to keep.",
        ],
      },
      {
        title: "User access and support",
        paragraphs: [
          "New accounts begin with a parent role. Parents can view team information but do not have editing permissions by default, and you can confirm this on [Admin > Users].",
          "Head coaches can promote parents to assistant coaches or table workers [Team Settings > Team Roles]. Admins can also resolve role issues or correct team assignments from [Admin > Users].",
          "If a meet is blocked by access problems, confirm the user role and team assignment on [Admin > Users], then confirm lock status on the meet page using Start Editing [Meet > Start Editing].",
          "Admins can promote other users to admin when additional league oversight is needed [Admin > Users]. There must always be at least one admin, so the last remaining admin cannot be removed.",
          "Keep team assignments clean. Coaches, parents, and table workers should be assigned to a team so the site shows the right rosters and meets. Admins are league-wide and are not assigned to a team [Admin > Users].",
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
          "Admins should avoid routine meet editing unless asked so coaches can keep control of their workflow. Step in when there is a dispute, a technical issue, or a need for cross-team coordination [Meets > select meet].",
          "Use your access to review data quality, promote consistency across teams, and support first-time users with training or documentation [Admin > League & Teams, Admin > Users].",
          "When someone reports missing meets or missing editing access, check role, team assignment, and meet status. Draft meets are editable by coaches with the lock, while published meets are intended to be stable and may need to be reopened as draft for changes [Admin > Users, Meets].",
        ],
      },
    ],
  },
  {
    id: "parents",
    title: "Parents",
    sections: [
      {
        title: "Role overview",
        paragraphs: [
          "When you create an account you begin as a parent [Sign Up]. Parents can link their wrestler, view upcoming meets and match history, and see published meet information, but cannot edit team data by default [My Wrestlers].",
          "If you need to help run a meet, ask your head coach to promote you to assistant coach or table worker. Table worker access is designed for volunteers who record results without changing pairings [Team Settings > Team Roles].",
        ],
      },
      {
        title: "My Wrestlers page",
        paragraphs: [
          "My Wrestlers is where you connect your account to the wrestler you want to track [My Wrestlers]. Search for the wrestler, confirm the name and team, and add them to your list.",
          "Once a wrestler is linked, you will see upcoming meets with scheduled bouts when a meet is published. You will also see match history for past meets so you can track opponents and results over time [My Wrestlers].",
          "If you do not see an upcoming meet yet, it usually means the meet is still in draft or coaches have not finished scheduling. Ask your coach when the meet will be published [My Wrestlers].",
        ],
      },
      {
        title: "What a table worker does",
        paragraphs: [
          "A table worker tracks bout results at a mat and keeps the bout sheet accurate. This role is essential for keeping the event moving and reporting accurate results [Results > select meet].",
          "Table workers focus on recording scores, winners, and bout order updates. They do not edit pairings or roster data unless given a coaching role [Results].",
          "If you are a table worker, coordinate with the head coach on which mat you are responsible for and how changes will be communicated. Most meet-day confusion comes from outdated paper, so confirm you are using the latest plan.",
        ],
      },
      {
        title: "Meet day expectations",
        paragraphs: [
          "Published meet schedules can change due to weigh-in changes, scratches, substitutions, or safety concerns. When things change, coaches may adjust pairings or mat order to keep the meet running smoothly.",
          "If something looks incorrect, bring it to your coach or table staff. Coaches coordinate changes using locks to avoid conflicting edits, so the best path is to alert them rather than trying to fix it yourself [My Wrestlers].",
        ],
      },
      {
        title: "Working with coaches",
        paragraphs: [
          "Coaches may share instructions for weigh-ins, check-in, or mat assignments. Use the help guide and the page labels to follow the workflow [Help].",
          "When the meet is active, avoid editing unless you have been promoted and asked to make changes. If you are promoted to table worker, focus on entering results accurately and quickly [Results].",
        ],
      },
    ],
  },
];
