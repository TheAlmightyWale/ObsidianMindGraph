### Phase 1 - Core functionality

#### Components
- Queue renderer
	- Takes Tasks and creates a Scrollable summary of tasks in the queue
	- Displays title of each task
- Queue editor / retrieval
	- List of tasks that is used as a data source for the Queue renderer
	- Editor API handles re-ordering tasks
- Task Editor
	- Uses a Task template page to be filled out
	- Task Editor API handles modifying Tasks or creating new ones

#### User Interactions 
- Add Task
	- Button to create a new task that gets automatically placed into the back of the queue
- Drag and drop on queue
	- Re-order task positions
- Mark Task as Done
	- Places task in to done list and no longer shows it in queue
	- Notification pop-up to undo this action if clicked accidently
- Edit task
	- Double click to open up task page where we can view and edit the task live.
- Delete task
	- Deletes task and entry in queue
	- Notification pop-up to undo this action if clicked accidently

### Phase 2 - Per Project Queueing

#### Components
- Project manager
	- What projects exist, tags to assign tasks to them
	- Organize task information in their own project folders
- Projects overview page
	- All project queues available
- Individual project page
	- Singular project queue available
	- Backlog of un-prioritized tasks
- Project backlog
	- Separate section inside Queue editor page
	- Unordered list of un prioritized tasks, View of which is shown in an individual project page
	- Queue editor can handle adding and removing from backlog in to queue

#### Refactors
- right now the queue reads information out of data.json. This could get unwieldy with having to update many queues. Before doing anything else we should refactor our queue to either use its own json file per queue or to instead use a markdown file to store queue information, making it obsidian native.

#### User Interactions
- Add task now has the option of automatically adding to back of a projects queue or adding to general backlog

### Phase 3 - Dependency Management and rendering

#### Components
- Dependency Graph renderer
	- Expanded view of tasks that displays them as nodes in a dependency graph while still maintaining position in the queue
	- Bottom of view will have numbered notches to show what position in the queue a task is, these go horizontally across the entire view window. Task nodes are aligned inside the boundaries of these notches. There is still blank space to allow for lines of dependency graph to be drawn
	- Side-bar of un prioritized tasks that user can add to queue by dragging and dropping
- Tasks now have a depends on and depended on section, where the title of tasks are listed
	- These cannot be edited except in the dependency graph view

#### User Interactions
- User can drag tasks on to dependency graph and it will be inserted into that position in the queue and with the appropriate dependencies and dependents
	- Can also be dropped on to last node in the graph which will insert it at the end
- 

### Phase 4 - Agentic contexts and Tasks

#### Components
- Configuration for what agents are available and how to hook prompt them / receive results
- Project level contexts where we can add project rules and descriptions to the agent
- Agent queue
	- list of tasks to be sent to agents and labelled as in-progress
	- Works in dependency order of what is laid out in task queue
	- Sends task out to agent and sets task to in-progress
	- To start off with we can only have 1 task assigned to each agent at a time, when a task is set to done from in-progress then a new task will be sent
#### User Interactions
- User can go to a configuration page to set up agents
	- User can send a test prompt and result when attempting to configure the agent
- Can navigate to the project page to add project context
- User can label a task as automatable
	- this will set that task as in-progress and message an agent to perform the task
	- agent responses will be handled by a separate application. The task will stay as in-progress until the user sets it to done. 
	- Any task that is dependant on an in-progress task cannot be started until it is labelled as done
	- tasks that are in-progress can be set to be retried, in which case they are sent to the agent again.

