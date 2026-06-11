export type NoteFile = {
  type: "file";
  name: string;
  title: string;
  path: string;
  excerpt: string;
  searchText: string;
  size: number;
  updatedAt: string;
  hidden: boolean;
};

export type NoteFolder = {
  type: "folder";
  name: string;
  title: string;
  path: string;
  children: NoteNode[];
};

export type NoteNode = NoteFile | NoteFolder;

export type NotesIndex = {
  generatedAt: string;
  root: string;
  count: number;
  hiddenCount: number;
  defaultPath: string;
  tree: NoteNode[];
  files: NoteFile[];
};

export type Heading = {
  id: string;
  text: string;
  level: number;
};
