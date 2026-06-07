All mind graph data will be stored in a .mindgraph folder.
Under this folder we will have the following folders
- Agents
	- Which will store agent information, contexts, skills, tools etc
	- Config for various agents / agent pool
- Projects
	- Which will contain the overall project view
	- Then individual folders which will hold specific tasks and dependency chains for each project
	- Task queues can just be links to task pages in a list that is manipulated by UI
	- We always have a default project for anything that doesn't have an explicit one set
- Config
	- Any other configuration
	- Includes white/blacklist for which folders to look over
