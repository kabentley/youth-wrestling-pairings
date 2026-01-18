type HelpSection = {
  title: string;
  paragraphs: string[];
};

type HelpPage = {
  id: string;
  title: string;
  sections: HelpSection[];
};

export const HELP_PAGES: HelpPage[] = [
  {
    id: "coaches",
    title: "Coaches",
    sections: [
      {
        title: "Role overview",
        paragraphs: [
          "Coaches are responsible for setting up meets and maintaining accurate rosters. Good rosters and clear meet setup are the foundation for fair pairings, smooth mat flow, and accurate results (Rosters, Meets, Team Settings).",
          "Every team has one head coach (Admin > League & Teams > Teams) but may have many assistant coaches. The head coach is the designated primary coach for the team so every team has at least one coach on record, while assistant coaches share the same day to day permissions (Team Settings, Rosters, Meets).",
          "Any coach can create and edit meets and update team and mat settings for their team (Meets, Team Settings). Assistant coaches help with editing and can take the lock during specific phases of the meet (Team Settings > Team Roles).",
          "The head coach designation is mainly for continuity and accountability, not special editing powers. Only admins can remove or change the head coach designation, and teams keep a single head coach for clarity (Admin > Users, Admin > League & Teams).",
          "When multiple coaches work the same meet, decide who will own the lock during each phase. One coach can build pairings while another reviews in read only mode, then you can hand off the lock for mat ordering or results (Meet > Start Editing, Meet > Release Lock, Meet > Comments).",
        ],
      },
      {
        title: "Account and permissions",
        paragraphs: [
          "When a user creates an account they start as a parent. As head coach, you can promote parents to assistant coaches or table workers for your team (Team Settings > Team Roles).",
          "Table workers focus on entering bout results and keeping the mat sheets accurate. This role is ideal for trusted volunteers who should not edit pairings (Results > select meet).",
          "Promote gradually. Many volunteers only need table worker access on meet day, while assistant coach access is best for people you trust to adjust pairings and mat order (Team Settings > Team Roles).",
        ],
      },
      {
        title: "Team Settings",
        paragraphs: [
          "Use Team Settings to manage your team profile, meet defaults, mat layout, and roles (Team Settings). The tabs keep these tasks organized so you can focus on one area at a time.",
          "Team Info is where you update website, home meet location, color, and logo for branding and printouts (Team Settings > Team Info).",
          "Meet Setup controls match limits, rest time between bouts rules, and auto pairing age limits used for new meets (Team Settings > Meet Setup). These defaults reduce repetitive setup work and make meet creation faster.",
          "Mat Setup defines the number of mats, their colors, and age or experience ranges for each mat (Team Settings > Mat Setup).",
          "Team Roles is where you promote parents to assistant coaches or table workers and review staff assignments (Team Settings > Team Roles).",
          "Use Rosters to add or import wrestlers and keep weights and availability current before each meet (Rosters).",
          "If a new meet is generating odd pairings, the first thing to check is roster data. Accurate weights, ages, and experience levels improve every automated recommendation (Rosters).",
        ],
      },
      {
        title: "Creating a new meet",
        paragraphs: [
          "Go to (Meets) and choose (New Meet) to start a meet draft. Enter the meet name and date, then select the other teams that will participate. Your team is always included automatically.",
          "The home team determines which team defaults are used for mats and pairing preferences. The home team will be the team of the coach who creates the meet, and only admins can change it (Admin > Users).",
          "Choose the number of mats and the target matches per wrestler for the day. These values shape how the meet will be laid out and how the initial pairing plan is generated (Meets > New Meet).",
          "Review the settings before saving. Match limits and rest time between bouts settings affect fairness and pacing, and the auto pairing limits affect which opponents are considered good matches (Team Settings > Meet Setup, Meet > Pairings).",
          "Press the Create Meet button to create the meet. After creating, the meet opens ready for editing so you can immediately review pairings and mat assignments while you have the lock (Meet > Pairings, Meet > Mat Assignments).",
        ],
      },
      {
        title: "Meets page",
        paragraphs: [
          "The Meets page lists your meets in date order and shows the meet name, date, location, team symbols, and draft or published status (Meets). Coaches see meets that include their team, while admins see every meet.",
          "Use View to open a meet, Edit to open it in edit mode, and Delete to remove a meet you no longer need. The list also shows who last edited the meet and when (Meets).",
          "Create New Meet opens the setup modal where you enter the name and date, choose teams, and adjust settings like mats and target matches. You can select up to three other teams; your team is always included (Meets > New Meet).",
          "Draft means the meet is still being prepared. Draft meets support full editing with the lock so coaches can build pairings, adjust mat order, and coordinate changes.",
          "Published means the meet plan is ready for broader sharing and day of use. Publishing is a signal to other coaches and table workers that the plan should be stable, even though you may still reopen the meet as a draft if changes are required (Meet > Publish).",
        ],
      },
      {
        title: "Meet page tabs",
        paragraphs: [
          "After you open a meet, the top of the page shows the status, last edit information, and lock controls. You enable edit mode by clicking the Edit button or Start Editing to request the lock before changing anything (Meet > Edit, Meet > Start Editing).",
          "Pairings is where you review who is currently scheduled and where you add or remove bouts. Mat Assignments is where you decide which mat each bout goes to and the order on each mat. Wall Charts is a visual view that is useful for checking balance across mats and printing a wall chart for the gym (Meet > Pairings, Meet > Mat Assignments, Meet > Wall Charts).",
        ],
      },
      {
        title: "Locks and collaboration",
        paragraphs: [
          "Each meet has a \"lock\" to ensure that only one coach at a time may edit it. When you click Edit on the Meets list or Start Editing inside a meet, you request the lock and become the active editor until you release it (Meets > Edit, Meet > Start Editing, Meet > Release Lock).",
          "If another coach currently has the lock, you will be advised with the username of that coach. You can still view the meet in read only mode. Use comments to coordinate changes and handoffs between coaches (Meet > Comments).",
          "Locks exist to prevent subtle problems like one coach reordering mats while another coach adds bouts, which can cause confusion and make printouts outdated. Agree on a rhythm: edit, save, communicate, and release (Meet > Comments).",
          "Locks automatically expire if they are not refreshed. The lock timeout is 2 minutes, so if the lock is not renewed it will clear and another coach can request it. A lock might not be refreshed if the browser tab is closed, the device sleeps, the network drops, the page is left open in the background, or the session expires; in those cases the system lets the lock time out so the meet does not stay blocked.",
          "The app also releases your lock after inactivity, if a coach holds the lock with the meet page open but walks away. The inactivity timer is 5 minutes, and you will see a countdown near the top of the meet page when a release is approaching. Simple activity like moving the mouse or clicking or tapping anywhere will reset the inactivity timer. If you see a message that the lock will be released due to inactivity, move your mouse or click.",
        ],
      },
      {
        title: "Pairings and fairness",
        paragraphs: [
          "Begin with automatic pairings, then review and adjust (Meet > Pairings). The goal is a plan that is fair, safe, and realistic for the day, not a perfect mathematical match.",
          "Use weight, age, and experience as the primary matching factors. If the roster data is correct, the highest scoring suggestions are usually the best starting point, but coaches should still apply common sense (Rosters, Meet > Pairings).",
          "Use the additional matches list to add or remove bouts (Meet > Pairings > Additional Matches). Enforce weight checks when required and document exceptions in comments so other coaches understand the decision (Meet > Comments).",
          "Use rest time between bouts settings to avoid scheduling the same wrestler too close together. This helps pacing and reduces fatigue, especially in meets with multiple mats (Team Settings > Meet Setup, Meet > Pairings).",
          "As you edit, keep an eye on match counts. A good meet plan spreads opportunities across wrestlers and avoids giving one athlete too many bouts while others get very few (Meet > Pairings).",
        ],
      },
      {
        title: "Mat assignments",
        paragraphs: [
          "Mat Assignments is your running order for the gym. Drag and drop bouts to balance mats and to group divisions or teams when your event format requires it (Meet > Mat Assignments).",
          "Use reorder to improve rest time between bouts based on the rest gap setting (your minimum spacing rule). Reorder is most useful after a round of pairing edits or after you move a large block of bouts between mats (Meet > Mat Assignments).",
          "Confirm that each mat has a sensible flow and that coaches can cover their wrestlers. If you make major changes close to the event start, communicate them and reprint any affected sheets (Meet > Comments).",
        ],
      },
      {
        title: "Printing and sharing",
        paragraphs: [
          "Plan prints around stability. Rosters are best printed early for check in and weigh ins, while wall charts and mat sheets should be printed after the mat order is stable (Meet > Wall Charts).",
          "If pairings or mat assignments change, assume that any paper already handed out is now outdated. Communicate changes and reprint what table workers and coaches will reference during the meet (Meet > Comments).",
        ],
      },
      {
        title: "Running the meet",
        paragraphs: [
          "Confirm weigh ins are complete before final pairing changes (Meet > Pairings). Assign a coach or table worker to keep results entry current as bouts finish (Results).",
          "If mat order shifts due to delays or substitutions, update the plan and reprint the affected sheets (Meet > Mat Assignments, Meet > Wall Charts). Keep the roster updated if late scratches occur (Rosters).",
          "During the meet, keep the workflow simple. Make pairing changes only when necessary, communicate them clearly, and then stabilize the plan again so table workers and coaches can trust what they see (Meet > Comments).",
        ],
      },
      {
        title: "Results entry",
        paragraphs: [
          "Enter results as bouts finish and confirm winners and result details (Results > select meet). Accurate results are helpful even during the meet because they prevent duplicate work and make later reporting easier.",
          "If multiple people are entering results, assign mats so two people are not entering the same bout. The goal is speed and accuracy, not perfection in the moment (Results).",
          "Before final reporting, scan for missing results so the data is complete. Use the results for standings or summaries as required by your league (Results).",
        ],
      },
      {
        title: "Troubleshooting",
        paragraphs: [
          "If you cannot edit a meet, check whether another coach holds the lock or if you are in read only mode. Start Editing will tell you who has the lock and when it expires (Meet > Start Editing).",
          "If a wrestler is missing, confirm they are active on the roster and that their data is complete (Rosters). Pairing quality depends on accurate age, weight, and experience values.",
          "If rest time between bouts looks tight or prints look wrong, review your rest gap setting (minimum spacing), match limits, and mat order, then reprint (Team Settings > Meet Setup, Meet > Mat Assignments, Meet > Wall Charts). Use comments to coordinate with other coaches and table staff.",
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
          "Admins manage league wide settings, onboarding, and access control. You can do this from (Admin > League & Teams) and (Admin > Users), which makes your role essential for getting the season organized.",
          "Admin access should focus on setup, oversight, and troubleshooting so coaches can run day to day meet workflows without surprises. Use (Admin > Users) when resolving role issues and (Admin > League & Teams) for structural changes.",
          "Admins may create and edit teams and rosters for every team, which is useful for onboarding, corrections, and emergency fixes (Admin > League & Teams, Rosters).",
          "Admins may also create and edit meets when needed for oversight, corrections, or shared league events (Meets).",
          "A good season kickoff checklist is league branding, teams created, head coach assigned for every team, and users verified with correct roles and team assignments (Admin > League & Teams, Admin > Users).",
        ],
      },
      {
        title: "League setup",
        paragraphs: [
          "Start by setting the league name, logo, website, and branding so printouts and screens are consistent across teams (Admin > League & Teams > League). These details help families and staff recognize official materials.",
          "Create a team record for each club or school and set names and symbols so teams can be recognized quickly on screens and printouts (Admin > League & Teams > Teams).",
          "Set team colors and upload team logos for readability. Colors and logos show up throughout the site and help table workers and families identify teams at a glance (Admin > League & Teams > Teams).",
          "Assign a head coach to each team so every team has at least one coach on record and someone responsible for coordination (Admin > League & Teams > Teams, Admin > Users).",
          "Admins can also end up setting the head coach indirectly when you assign a coach to a team. If a team does not already have a head coach, the first coach assigned becomes the head coach automatically (Admin > Users).",
          "Head coach is a designation, not a separate permission level. Day to day, all coaches have the same capabilities, but the head coach label helps with ownership and continuity (Admin > Users).",
          "Use the Teams table to upload logos, update details, and remove teams when necessary. Deleting a team is destructive, so use it only when you are sure it should be removed (Admin > League & Teams > Teams).",
        ],
      },
      {
        title: "Export, import, and new year reset",
        paragraphs: [
          "Use export to create a backup of teams and rosters before major changes or at season end (Admin > League & Teams > Export Teams + Rosters). Save the zip file somewhere safe.",
          "Use import to restore teams and rosters from a prior export or a league provided file (Admin > League & Teams > Import Teams + Rosters). Import clears existing rosters first, so confirm you have a backup before proceeding and expect rosters to be replaced.",
          "Import and reset require typing a confirmation word. This is intentional because these actions are destructive and are difficult to undo (Admin > League & Teams).",
          "Use the new year reset when you are ready to clear all meets and rosters for a fresh season (Admin > League & Teams > Reset For New Year). This is permanent and should be done only after exporting what you want to keep.",
        ],
      },
      {
        title: "User access and support",
        paragraphs: [
          "New accounts begin with a parent role. Parents can view team information but do not have editing permissions by default, and you can confirm this on (Admin > Users).",
          "Head coaches can promote parents to assistant coaches or table workers (Team Settings > Team Roles). Admins can also resolve role issues or correct team assignments from (Admin > Users).",
          "If a meet is blocked by access problems, confirm the user role and team assignment on (Admin > Users), then confirm lock status on the meet page using Start Editing (Meet > Start Editing).",
          "Admins can promote other users to admin when additional league oversight is needed (Admin > Users). There must always be at least one admin in the system, so the last remaining admin cannot be removed.",
          "Keep team assignments clean. Coaches, parents, and table workers should be assigned to a team so the site can show the right rosters and meets, while admins are league wide and are not assigned to a team (Admin > Users).",
        ],
      },
      {
        title: "User management",
        paragraphs: [
          "Use the user list to search, filter by team, and page through accounts (Admin > Users). This helps you locate coaches, parents, and table workers quickly.",
          "Create new users with their username, contact info, role, and team assignment (Admin > Users > Create New User). This is useful for onboarding staff who have not signed up yet.",
          "Update roles and team assignments directly in the user table (Admin > Users). If a coach changes teams mid season, update their team assignment so they see the correct meets and rosters.",
          "Reset passwords when needed and delete accounts that should no longer have access (Admin > Users). You cannot delete your own account or remove the last remaining admin.",
        ],
      },
      {
        title: "Governance and oversight",
        paragraphs: [
          "Admins should avoid routine meet editing unless asked, so coaches can keep control of their workflow. Step in when there is a dispute, a technical issue, or a need for cross team coordination (Meets > select meet).",
          "Use your access to review data quality, promote consistency across teams, and support first time users with training or documentation (Admin > League & Teams, Admin > Users).",
          "When someone reports missing meets or missing editing access, the fastest checklist is role, team assignment, and meet status. Draft meets are editable by coaches with the lock, while published meets are intended to be stable and may need to be reopened as draft for changes (Admin > Users, Meets).",
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
          "When you create an account you begin as a parent (Sign Up). Parents can link their wrestler, view upcoming meets and match history, and see published meet information, but cannot edit team data by default (My Wrestlers).",
          "If you need to help run a meet, ask your head coach to promote you to assistant coach or table worker. Table worker access is designed for volunteers who help record results without changing pairings (Team Settings > Team Roles).",
        ],
      },
      {
        title: "My Wrestlers page",
        paragraphs: [
          "My Wrestlers is where you connect your account to the wrestler you want to track (My Wrestlers). Search for the wrestler, confirm the name and team, and add them to your list.",
          "Once a wrestler is linked, you will see upcoming meets with scheduled bouts when a meet has been published. You will also see match history for past meets so you can track opponents and results over time (My Wrestlers).",
          "If you do not see an upcoming meet yet, it usually means the meet is still in draft or coaches have not finished scheduling. Ask your coach when the meet will be published (My Wrestlers).",
        ],
      },
      {
        title: "What a table worker does",
        paragraphs: [
          "A table worker tracks bout results at a mat and keeps the bout sheet accurate. This role is essential for keeping the event moving and reporting accurate results (Results > select meet).",
          "Table workers should focus on recording scores, winners, and bout order updates. They do not edit pairings or roster data unless given a coaching role (Results).",
          "If you are a table worker, coordinate with the head coach on which mat you are responsible for and how changes will be communicated. Most meet day confusion comes from outdated paper, so always confirm you are using the latest plan.",
        ],
      },
      {
        title: "Meet day expectations",
        paragraphs: [
          "Published meet schedules can change due to weigh in changes, scratches, substitutions, or safety concerns. When things change, coaches may adjust pairings or mat order to keep the meet running smoothly.",
          "If something looks incorrect, bring it to your coach or table staff. Coaches coordinate changes using locks to avoid conflicting edits, so the best path is to alert them rather than trying to fix it yourself (My Wrestlers).",
        ],
      },
      {
        title: "Working with coaches",
        paragraphs: [
          "Coaches may share instructions for weigh ins, check in, or mat assignments. Use the help guide and the page labels to follow the workflow (Help).",
          "When the meet is active, avoid editing unless you have been promoted and asked to make changes. If you are promoted to table worker, focus on entering results accurately and quickly (Results).",
        ],
      },
    ],
  },
];
