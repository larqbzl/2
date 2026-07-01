import { useState, useEffect } from "react";

export type Project = {
  id: string;
  name: string;
  notes: string;
  prompts: string[];
  results: Record<string, any[]>;
  createdAt: number;
  lastModified: number;
};

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>(() => {
    const saved = localStorage.getItem("media_finder_projects");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return [];
      }
    }
    return [];
  });

  useEffect(() => {
    localStorage.setItem("media_finder_projects", JSON.stringify(projects));
  }, [projects]);

  const addProject = (name: string) => {
    const newProject: Project = {
      id: crypto.randomUUID(),
      name,
      notes: "",
      prompts: [],
      results: {},
      createdAt: Date.now(),
      lastModified: Date.now(),
    };
    setProjects([newProject, ...projects].slice(0, 20));
    return newProject.id;
  };

  const updateProject = (id: string, updates: Partial<Project>) => {
    setProjects(projects.map((p) => (p.id === id ? { ...p, ...updates, lastModified: Date.now() } : p)));
  };

  const deleteProject = (id: string) => {
    setProjects(projects.filter((p) => p.id !== id));
  };

  return { projects, addProject, updateProject, deleteProject };
}
