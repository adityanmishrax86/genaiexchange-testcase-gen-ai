# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is a **Healthcare AI Test Case Generator** frontend - a React + TypeScript single-page application for visually designing and executing workflows to generate, review, and manage test cases from requirements documents. The application supports FDA & IEC-62304 compliance workflows and integrates with multiple test management systems (JIRA, Azure DevOps, TestRail, Polarion).

## Common Development Commands

### Setup & Installation
```bash
npm install              # Install all dependencies
```

### Development
```bash
npm run dev             # Start development server (http://localhost:5173)
npm run build           # Build for production
npm run serve           # Preview production build locally
```

### Environment Configuration
- Copy `.env.example` to `.env` and configure:
  - `VITE_API_BASE`: Backend API base URL (e.g., `http://localhost:8000/api`)

## Architecture & Code Structure

### High-Level Overview

The application follows a **pre-embedded visual workflow pattern** where a complete healthcare test case generation workflow is automatically initialized with all nodes. Users can:

1. Toggle optional workflow components via settings (Standard Document Upload, Judge LLM Evaluation)
2. Run the workflow with a single click
3. Configure each node's settings as needed
4. Monitor progress via metrics dashboard

```
Workflow Auto-Initialized
    ↓
User Toggles Optional Features (via ⚙️ Settings)
    ↓
Workflow Updates to Match Config
    ↓
User Runs Workflow (Sequential Node Processing)
    ↓
Tracks Metrics (KPIs Dashboard Updates)
    ↓
Exports Results (To ALM systems)
```

**Key Benefit**: Users don't need to manually assemble the workflow every time. The standard healthcare test case generation process is pre-built, with optional enhancements (standards compliance, AI-powered validation) that can be toggled on/off.

### Directory Structure

```
frontend/
├── src/
│   ├── main.tsx                      # React app entry point
│   ├── App.tsx                       # Main application (~1800 LOC, uses pre-embedded workflow)
│   ├── index.css                     # Global styles, Tailwind integration, CSS custom properties
│   ├── vite-env.d.ts                 # Vite type definitions
│   ├── typescript.svg                # Asset
│   ├── config/
│   │   └── workflowConfig.ts         # Pre-embedded workflow definition & configuration
│   └── components/
│       └── WorkflowSettings.tsx      # Settings modal for toggling optional features
├── public/                           # Static assets
├── index.html                        # HTML entry point
├── vite.config.ts                    # Vite bundler config (React + Tailwind plugins)
├── tsconfig.json                     # TypeScript compiler settings
├── package.json                      # Dependencies & npm scripts
├── .env.example                      # Environment variables template
├── README.md                         # User-facing documentation
└── CLAUDE.md                         # This file - guidance for Claude Code
```

### Monolithic Component Structure

**Critical Context**: The entire application logic is contained in **one large component** (`App.tsx` ~1800 lines). This is intentional for this prototype/MVP phase. When refactoring:

- Extract node component definitions (`UploadNode`, `ProcessorNode`, `ValidatorNode`, `ManualNode`, `IntegrationNode`) to separate files
- Create a custom hook for workflow execution logic (`useWorkflowEngine`)
- Create a separate component for the sidebar (`Sidebar` → `components/Sidebar.tsx`)
- Create a separate component for the metrics dashboard (`MetricsDashboard` → `components/MetricsDashboard.tsx`)

### Core Architecture Patterns

#### **Pre-Embedded Workflow Configuration**
The entire healthcare test case generation workflow is **pre-built and always initialized** with all nodes. Optional features can be toggled on/off without changing the core workflow structure:

**Workflow Definition** (`src/config/workflowConfig.ts`):
- `DEFAULT_WORKFLOW_NODES`: Array of 7 pre-configured nodes in optimal order
- `DEFAULT_WORKFLOW_EDGES`: Predefined connections between nodes
- `WorkflowConfig` interface: Tracks which optional features are enabled
  - `includeStandards`: Enable "Upload Standards" node (for compliance mapping)
  - `includeJudge`: Enable "Judge LLM Evaluation" node (for AI-powered quality scoring)

**Workflow Initialization**:
```typescript
// On App load, initialize workflow with current config
const initialWorkflow = initializeWorkflow(workflowConfig);
const [nodes, setNodes] = useNodesState(initialWorkflow.nodes);
const [edges, setEdges] = useEdgesState(initialWorkflow.edges);

// When user toggles settings, workflow automatically updates
useEffect(() => {
  const newWorkflow = initializeWorkflow(workflowConfig);
  setNodes(newWorkflow.nodes);
  setEdges(newWorkflow.edges);
}, [workflowConfig]);
```

**Optional Nodes**:
- `node-3-upload-standards`: Only rendered if `includeStandards: true`
- `node-5-judge`: Only rendered if `includeJudge: true`

#### **State Management**
- React Hooks only (useState, useCallback, useRef, useMemo, useEffect)
- No external state management library
- Local component state for:
  - `workflowConfig`: Optional feature toggles
  - `nodes` & `edges`: ReactFlow state (auto-synced with config)
  - UI modals, form inputs, processing status
- State is passed down to node components via `data` props

#### **Workflow Engine**
The `runWorkflow()` function orchestrates the entire process:

1. **Entry Detection**: Finds the upload requirements node (entry point)
2. **Node Sequence Building**: Traverses edges to build ordered node queue (skips disabled nodes)
3. **Sequential Processing**: Processes each visible node with 2-second delays
4. **State Updates**: Updates UI (`processing` flag) and metrics dashboard
5. **Error Handling**: Try-catch blocks with user-facing error messages

```typescript
// Simplified execution flow
const runWorkflow = () => {
  const uploadNode = nodes.find(n => n.id === 'node-1-upload-requirements');
  const sequence = buildNodeSequence(uploadNode, edges);  // Respects visible edges

  for (const nodeId of sequence) {
    markNodeAsProcessing(nodeId);
    await simulateProcessing(2000);  // 2-second delay
    updateMetrics();
  }
};
```

#### **Node Types & Responsibilities**

| Node Type | Purpose | Key Methods |
|-----------|---------|-------------|
| **UploadNode** | File upload (requirements & knowledge base documents) | Manages file inputs, upload simulation |
| **ProcessorNode** | Parse documents, generate test cases, or enhance via RAG | API calls, model selection, temperature control |
| **ValidatorNode** | Quality validation with pass/fail scoring | Threshold logic, branching based on score |
| **ManualNode** | Human review & approval interface | Test case list, checkbox selection, approval buttons |
| **IntegrationNode** | Push results to external systems | JIRA, Azure DevOps, TestRail, Polarion connectors |

#### **Data Flow**
```
API Responses
    ↓
Node.data (node settings & outputs)
    ↓
ReactFlow edges (connections)
    ↓
Workflow execution (runWorkflow function)
    ↓
Metrics dashboard (real-time KPI updates)
```

### API Communication Pattern

The application uses **Fetch API** with environment-based configuration:

```typescript
const BASE_URL = import.meta.env.VITE_API_BASE || '/api';

// Example endpoint calls:
// POST /api/documents/extract - Parse requirements
// POST /api/generate/preview - Generate test cases
// POST /api/generate/confirm - Confirm & store test cases
// POST /api/validate/quality - Quality validation
// POST /api/integration/push - Push to external system
```

### Component Interface Pattern

Custom node components follow this interface:

```typescript
interface NodeComponentProps {
  data: {
    name: string;
    label: string;
    processorType?: string;  // for ProcessorNode
    optional?: boolean;
    runnable?: boolean;
    processing?: boolean;
    onProcessed?: (result: any) => void;  // Callback when node completes
    // ... other node-specific properties
  };
  isConnected: boolean;
  selected: boolean;
}
```

### Styling Architecture

- **Tailwind CSS v4** (via `@tailwindcss/vite` plugin) for utility-first CSS
- **CSS Custom Properties** in `index.css` for theming (colors, spacing)
- **Global component classes** defined in `index.css`:
  - `.btn`, `.btn-primary`, `.card`, `.modal`, `.stepper`, etc.
- **Inline Tailwind classes** for component-specific styling

CSS Variables (in `:root`):
- `--bg`: Page background color
- `--card`: Card background
- `--primary`: Primary accent color
- `--success`, `--error`: Status colors

### Key Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `react` | ^18.3.1 | UI framework |
| `react-dom` | ^18.3.1 | React DOM rendering |
| `@xyflow/react` | ^12.9.0 | Visual node-based workflow canvas |
| `tailwindcss` | ^4.1.16 | Utility-first CSS framework |
| `@tailwindcss/vite` | ^4.1.16 | Tailwind + Vite integration |
| `typescript` | ^5.9.2 | Type checking |
| `vite` | ^7.1.5 | Build tool & dev server |

### New Components & Configuration Files

#### **`src/config/workflowConfig.ts`**
Centralizes the entire workflow definition and configuration system:

- **`WorkflowNode` interface**: Defines node structure with optional feature keys
- **`WorkflowEdge` interface**: Defines edge structure with conditional rendering
- **`WorkflowConfig` interface**: Feature toggles (`includeStandards`, `includeJudge`)
- **`DEFAULT_WORKFLOW_NODES`**: Array of 7 pre-configured nodes (Upload, Extract, Standards, Generate, Judge, Review, Export)
- **`DEFAULT_WORKFLOW_EDGES`**: Predefined connections with conditional rendering
- **Helper functions**:
  - `getVisibleNodes()`: Filter nodes based on config
  - `getVisibleEdges()`: Filter edges based on config
  - `buildExecutionSequence()`: Traverse workflow graph for execution order
  - `initializeWorkflow()`: Complete workflow initialization

This file is the **single source of truth** for the healthcare test case generation workflow.

#### **`src/components/WorkflowSettings.tsx`**
React component for the settings modal:

- **Feature toggles** with visual previews
- **Workflow preview diagram** showing exact flow based on selections
- **Gradient header** and professional styling with Tailwind
- **Props**:
  - `config`: Current WorkflowConfig
  - `onConfigChange`: Callback when user saves settings
  - `onClose`: Callback to close modal
- **UX**: Shows real-time workflow preview as user toggles features

## Development Workflow

### User Interaction Flow

1. **App Loads**: Workflow is auto-initialized with all 7 nodes (both mandatory & optional)
2. **User Clicks ⚙️ Settings**: WorkflowSettings modal opens
3. **User Toggles Features**:
   - Toggles `includeStandards` → Adds/removes "Upload Standards" node
   - Toggles `includeJudge` → Adds/removes "Judge LLM Evaluation" node
4. **Workflow Dynamically Updates**: useEffect triggers `initializeWorkflow()`, updating nodes/edges
5. **User Clicks Play ▶️**: Workflow executes only visible nodes in sequence
6. **Metrics Update**: Dashboard KPIs update as each node completes

### Adding a New Optional Feature

1. **Define new feature** in `WorkflowConfig` interface (e.g., `includeRAG: boolean`)
2. **Add new node** to `DEFAULT_WORKFLOW_NODES` with `featureKey: 'includeRAG'`
3. **Add edges** to `DEFAULT_WORKFLOW_EDGES` with conditional logic
4. **Update WorkflowSettings.tsx** with new toggle checkbox
5. **Test end-to-end**: Verify nodes appear/disappear on toggle, workflow executes correctly

### Modifying the Workflow Structure

1. **Edit `src/config/workflowConfig.ts`**:
   - Update node positions (adjust `X_OFFSET`, `Y_OFFSET`)
   - Add/remove nodes or edges
   - Modify optional feature logic
2. **Update `App.tsx`** if node types or data properties change
3. **Test with dev server**: `npm run dev`

### Common Tasks

#### Adding a New Node Type
1. Create node component function in `App.tsx` (or new file)
2. Register in `nodeTypes` object
3. Add to `DEFAULT_WORKFLOW_NODES` in config
4. Connect via edges in `DEFAULT_WORKFLOW_EDGES`
5. Handle processing logic in `runWorkflow()` function

#### Modifying API Endpoints
1. Update endpoint URLs in the appropriate node's processing function
2. Adjust request/response handling
3. Update error messages
4. Test with dev API server running on `VITE_API_BASE`

#### Updating Metrics Dashboard
1. Identify which nodes should update KPIs
2. Call `setMetrics(prev => {...})` when nodes complete
3. Ensure metrics reflect current workflow state
4. Test with various feature toggles enabled/disabled

## TypeScript Configuration

- **Target**: ES2022
- **Strict Mode**: Disabled (loose type checking for MVP flexibility)
- **JSX**: react-jsx (automatic JSX transform)
- **Module Resolution**: bundler
- **Base URL**: "." (relative imports)

Note: To enable strict mode later, set `"strict": true` in `tsconfig.json` and resolve any type errors.

## Build & Deployment

### Production Build
```bash
npm run build
```

Output is generated in the `dist/` directory with subdirectory deployment support (base path: `/tcgen-ai-genaiexchange-frontend/`).

### Deployment Configuration
The `base` setting in `vite.config.ts` is set to `/tcgen-ai-genaiexchange-frontend/`, meaning the app expects to be served from that subdirectory. Adjust this for different deployment paths.

## Important Implementation Notes

### No Routing
This is a **single-page application** with **no React Router**. Navigation occurs via:
- Modal dialogs for configuration
- Step-based UI state (`currentStep`)
- Canvas-based workflow selection

### Data Persistence
Currently, there is no persistent data storage. Consider adding:
- LocalStorage for workflow templates
- Backend persistence for generated test cases
- Session storage for in-progress workflows

### Error Handling
Errors are caught at the node level and displayed via:
- Toast notifications
- Modal dialogs
- Status indicators in the metrics dashboard

## Debugging Tips

1. **Workflow Not Initializing**: Check `initializeWorkflow()` is called in useEffect
2. **Nodes/Edges Not Updating on Toggle**: Verify `workflowConfig` state change triggers useEffect
3. **Settings Modal Not Opening**: Check `showSettings` state in header button click handler
4. **Optional Nodes Not Hiding**: Verify `featureKey` is set on optional nodes in workflowConfig.ts
5. **Edges Not Conditional**: Check conditional rendering logic in `getVisibleEdges()`
6. **ReactFlow Issues**: Check node positions, edge connections, and handle alignment in workflowConfig
7. **API Errors**: Verify `VITE_API_BASE` environment variable is set correctly
8. **Metrics Not Updating**: Check `setMetrics()` calls in node processing functions
9. **Workflow Execution Skipping Nodes**: Verify `buildExecutionSequence()` correctly traverses visible edges

## Integration with Backend

The frontend workflow maps to these backend endpoints (from README_HACKATHON.md):

| Node | Backend Endpoint | Purpose |
|------|------------------|---------|
| Upload Requirements | `POST /api/upload` | Upload requirements document |
| Extract | `POST /api/extract/{doc_id}` | Parse requirements |
| Upload Standards | `POST /api/standards/upload` | Upload compliance guidelines |
| Generate Tests | `POST /api/generate/preview` | Generate test case previews |
| Judge LLM | `POST /api/judge/evaluate-batch` | AI quality evaluation |
| Human Review | `GET /api/review/package/{id}` | Get review package |
| Export | `POST /api/export/jira` | Push to external systems |

Nodes execute sequentially based on visible edges. Optional nodes (Standards, Judge) are included only when enabled in WorkflowSettings.

## Cursor Rules

No Cursor or Copilot rules are currently configured for this repository.
