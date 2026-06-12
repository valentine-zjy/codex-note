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

export type UserRole = "admin" | "viewer";

export type AuthUser = {
  username: string;
  displayName: string;
  role: UserRole;
  priority: number;
  canEdit: boolean;
};

export type Heading = {
  id: string;
  text: string;
  level: number;
};

export type AdminUser = AuthUser & {
  hasPassword: boolean;
};

export type ResumeMode = "file" | "link";

export type ResumeFileType = "html" | "markdown" | "pdf";

export type ReviewStatus = "pending" | "approved" | "rejected";

export type ResumeProfile =
  | {
      type: "link";
      title: string;
      url: string;
      updatedAt: string;
      reviewedBy?: string;
    }
  | {
      type: "html" | "markdown" | "pdf";
      title: string;
      fileName: string;
      content: string;
      updatedAt: string;
      reviewedBy?: string;
    };

export type ResumeRequest = {
  id: string;
  username: string;
  displayName: string;
  mode: ResumeMode;
  status: ReviewStatus;
  title: string;
  submittedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  comment?: string;
  fileName?: string;
  fileType?: ResumeFileType;
  content?: string;
  url?: string;
};

export type KnowledgeBase = {
  id: string;
  ownerUsername: string;
  ownerDisplayName: string;
  title: string;
  description: string;
  rootPath: string;
  folders?: string[];
  createdAt: string;
  updatedAt: string;
};

export type KnowledgeRequestType = "folder" | "document";

export type KnowledgeRequest = {
  id: string;
  type: KnowledgeRequestType;
  status: ReviewStatus;
  baseId: string;
  baseTitle: string;
  username: string;
  displayName: string;
  targetFolder: string;
  title?: string;
  fileName?: string;
  content?: string;
  submittedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  comment?: string;
};

export type TodoScope = "day" | "week" | "month";

export type TodoItem = {
  id: string;
  text: string;
  note: string;
  done: boolean;
  createdAt: number;
  dueDate: string;
  scope: TodoScope;
};

export type UserProfile = {
  username: string;
  displayName: string;
  title: string;
  email: string;
  phone: string;
  location: string;
  website: string;
  bio: string;
  avatarDataUrl?: string;
  updatedAt?: string;
};
