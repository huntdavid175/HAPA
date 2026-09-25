"use client";

import { useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import {
  BoldIcon,
  ItalicIcon,
  LinkIcon,
  ListIcon,
  ListOrderedIcon,
  QuoteIcon,
  StrikethroughIcon,
  Undo2Icon,
  Redo2Icon,
  HeadingIcon,
} from "lucide-react";

import { Separator } from "@/components/ui/separator";
import { Toggle } from "@/components/ui/toggle";

/**
 * The event description.
 *
 * Tiptap rather than a textarea because organisers write running order, day-by-day
 * schedules and links, and asking them to hand-write HTML is not reasonable. The toolbar
 * is deliberately short: this is a paragraph about a party, not a CMS.
 *
 * What posts is HTML in a hidden input. The server sanitises it against a small allowlist
 * before it is stored, so the database never holds markup the public page has to be
 * careful with — see lib/rich-text.ts.
 */
export function DescriptionEditor({
  name,
  defaultValue,
  form,
}: {
  name: string;
  defaultValue: string;
  /** The form this posts with, when the editor is not inside it. */
  form?: string;
}) {
  const [html, setHtml] = useState(defaultValue);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Kept out of the allowlist on the server, so do not offer them here either.
        codeBlock: false,
        code: false,
        horizontalRule: false,
        heading: { levels: [3, 4] },
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        protocols: ["http", "https", "mailto", "tel"],
      }),
    ],
    content: defaultValue,
    // Server-render nothing: Tiptap builds the DOM on the client, and letting it try
    // during SSR is a guaranteed hydration mismatch.
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          "min-h-48 max-h-[28rem] overflow-y-auto w-full px-3 py-2.5 text-base outline-none [&_h3]:mt-4 [&_h3]:text-lg [&_h3]:font-semibold [&_h4]:mt-3 [&_h4]:font-semibold [&_p]:mt-2 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mt-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_blockquote]:mt-2 [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_a]:underline [&_:first-child]:mt-0",
      },
    },
    onUpdate: ({ editor }) => setHtml(editor.getHTML()),
  });

  return (
    <div className="border-input focus-within:border-ring focus-within:ring-ring/50 overflow-hidden rounded-lg border focus-within:ring-[3px]">
      <div className="bg-muted/40 flex flex-wrap items-center gap-0.5 border-b p-1">
        <Mark editor={editor} icon={BoldIcon} label="Bold" mark="bold" />
        <Mark editor={editor} icon={ItalicIcon} label="Italic" mark="italic" />
        <Mark editor={editor} icon={StrikethroughIcon} label="Strikethrough" mark="strike" />

        <Separator orientation="vertical" className="mx-1 h-6" />

        <Toggle
          size="sm"
          aria-label="Heading"
          pressed={editor?.isActive("heading", { level: 3 }) ?? false}
          onPressedChange={() =>
            editor?.chain().focus().toggleHeading({ level: 3 }).run()
          }
        >
          <HeadingIcon />
        </Toggle>
        <Mark editor={editor} icon={ListIcon} label="Bullet list" mark="bulletList" />
        <Mark
          editor={editor}
          icon={ListOrderedIcon}
          label="Numbered list"
          mark="orderedList"
        />
        <Mark editor={editor} icon={QuoteIcon} label="Quote" mark="blockquote" />

        <Separator orientation="vertical" className="mx-1 h-6" />

        <Toggle
          size="sm"
          aria-label="Link"
          pressed={editor?.isActive("link") ?? false}
          onPressedChange={() => {
            if (!editor) return;
            if (editor.isActive("link")) {
              editor.chain().focus().unsetLink().run();
              return;
            }
            const url = window.prompt("Link to where?");
            if (!url) return;
            editor.chain().focus().setLink({ href: url }).run();
          }}
        >
          <LinkIcon />
        </Toggle>

        <div className="ml-auto flex items-center gap-0.5">
          <Toggle
            size="sm"
            aria-label="Undo"
            pressed={false}
            disabled={!editor?.can().undo()}
            onPressedChange={() => editor?.chain().focus().undo().run()}
          >
            <Undo2Icon />
          </Toggle>
          <Toggle
            size="sm"
            aria-label="Redo"
            pressed={false}
            disabled={!editor?.can().redo()}
            onPressedChange={() => editor?.chain().focus().redo().run()}
          >
            <Redo2Icon />
          </Toggle>
        </div>
      </div>

      <EditorContent editor={editor} />
      <input type="hidden" name={name} value={html} form={form} />
    </div>
  );
}

/** A toolbar button whose pressed state follows the cursor's position in the document. */
function Mark({
  editor,
  icon: Icon,
  label,
  mark,
}: {
  editor: Editor | null;
  icon: React.ComponentType;
  label: string;
  mark: "bold" | "italic" | "strike" | "bulletList" | "orderedList" | "blockquote";
}) {
  const toggle = {
    bold: () => editor?.chain().focus().toggleBold().run(),
    italic: () => editor?.chain().focus().toggleItalic().run(),
    strike: () => editor?.chain().focus().toggleStrike().run(),
    bulletList: () => editor?.chain().focus().toggleBulletList().run(),
    orderedList: () => editor?.chain().focus().toggleOrderedList().run(),
    blockquote: () => editor?.chain().focus().toggleBlockquote().run(),
  }[mark];

  return (
    <Toggle
      size="sm"
      aria-label={label}
      pressed={editor?.isActive(mark) ?? false}
      onPressedChange={toggle}
    >
      <Icon />
    </Toggle>
  );
}
