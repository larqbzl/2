import { useState } from "react";
import { useProjects, Project } from "@/hooks/useProjects";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, ChevronRight, FileDown, Calendar, Search } from "lucide-react";
import { format } from "date-fns";

export default function ProjectsTab() {
  const { projects, addProject, updateProject, deleteProject } = useProjects();
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [newProjectName, setNewProjectName] = useState("");

  const handleCreate = () => {
    if (!newProjectName.trim()) return;
    const id = addProject(newProjectName);
    setNewProjectName("");
    setActiveProject(projects.find(p => p.id === id) || null);
  };

  const exportProject = (p: Project) => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(p, null, 2));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href", dataStr);
    dlAnchorElem.setAttribute("download", `project-${p.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.json`);
    dlAnchorElem.click();
  };

  if (activeProject) {
    return (
      <div className="max-w-4xl mx-auto space-y-6 animate-in slide-in-from-right-4 duration-300">
        <Button variant="ghost" onClick={() => setActiveProject(null)} className="-ml-4 mb-4 text-muted-foreground hover:text-foreground">
          ← Back to Projects
        </Button>
        
        <div className="flex items-center justify-between">
          <Input 
            value={activeProject.name}
            onChange={(e) => {
              updateProject(activeProject.id, { name: e.target.value });
              setActiveProject({ ...activeProject, name: e.target.value });
            }}
            className="text-3xl font-bold bg-transparent border-none px-0 h-auto focus-visible:ring-0 text-primary w-2/3"
          />
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => exportProject(activeProject)}>
              <FileDown className="w-4 h-4 mr-2" /> Backup JSON
            </Button>
            <Button variant="destructive" onClick={() => { deleteProject(activeProject.id); setActiveProject(null); }}>
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <Card className="p-6 border-card-border bg-card space-y-4">
          <h3 className="font-bold text-foreground">Project Notes</h3>
          <Textarea 
            value={activeProject.notes}
            onChange={(e) => {
              updateProject(activeProject.id, { notes: e.target.value });
              setActiveProject({ ...activeProject, notes: e.target.value });
            }}
            placeholder="Script outline, video concepts, list of needed clips..."
            className="min-h-[200px] bg-input border-border"
          />
        </Card>

        <Card className="p-6 border-card-border bg-card space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-foreground">Prompts & Assets</h3>
            <Button size="sm">
              <Search className="w-4 h-4 mr-2" /> Run Batch Search
            </Button>
          </div>
          
          <div className="text-sm text-muted-foreground p-8 text-center border-2 border-dashed border-border rounded-lg">
            No prompts added yet. Use the Batch Search tab and select this project to save results here.
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-300">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-primary">Projects</h2>
          <p className="text-sm text-muted-foreground">Manage your video research workspaces</p>
        </div>
        
        <div className="flex gap-2">
          <Input 
            placeholder="New project name..." 
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            className="w-64 bg-input border-border"
          />
          <Button onClick={handleCreate} disabled={!newProjectName.trim()}>
            <Plus className="w-4 h-4 mr-2" /> Create
          </Button>
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground border-2 border-dashed border-border rounded-lg">
          No projects yet. Create one to organize your research.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {projects.map(p => (
            <Card 
              key={p.id} 
              className="p-6 border-card-border bg-card hover:border-primary/50 cursor-pointer transition-colors group"
              onClick={() => setActiveProject(p)}
            >
              <div className="flex justify-between items-start mb-4">
                <h3 className="font-bold text-lg text-foreground group-hover:text-primary transition-colors">{p.name}</h3>
                <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              
              <div className="space-y-2 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Modified {format(p.lastModified, "MMM d, yyyy")}
                </div>
                <div>{p.prompts?.length || 0} saved prompts</div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
