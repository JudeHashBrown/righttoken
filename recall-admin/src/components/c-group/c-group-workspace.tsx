"use client";

import type { DGroupWorkspaceData } from "@/modules/d-group/types";
import { DGroupWorkspace } from "@/components/d-group/d-group-workspace";

type Mailbox = { id: string; name: string; emailAddress: string };
type Template = { id: string; name: string; subject: string; bodyText: string };

export function CGroupWorkspace({ initialData, mailboxes, templates }: {
  initialData: DGroupWorkspaceData;
  mailboxes: Mailbox[];
  templates: Template[];
}) {
  return <DGroupWorkspace groupCode="C" initialData={initialData} mailboxes={mailboxes} templates={templates} />;
}
