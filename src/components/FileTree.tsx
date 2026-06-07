import { useState } from "react";
import { ChevronDown, ChevronRight, File, FileCode, Folder } from "lucide-react";
import type { FileNode } from "../lib/api";

interface Props {
  nodes: FileNode[];
  onOpen: (node: FileNode) => void;
  activePath?: string;
  depth?: number;
}

function TreeNode({
  node,
  onOpen,
  activePath,
  depth = 0,
}: {
  node: FileNode;
  onOpen: (n: FileNode) => void;
  activePath?: string;
  depth?: number;
}) {
  const [open, setOpen] = useState(depth < 1);

  if (node.is_dir) {
    return (
      <div>
        <div
          className="tree-row"
          style={{ paddingLeft: depth * 12 + 8 }}
          onClick={() => setOpen((o) => !o)}
        >
          <span className="tree-caret">
            {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </span>
          <span className="tree-icon">
            <Folder size={13} />
          </span>
          <span className="tree-name">{node.name}</span>
        </div>
        {open &&
          node.children?.map((c) => (
            <TreeNode
              key={c.path}
              node={c}
              onOpen={onOpen}
              activePath={activePath}
              depth={depth + 1}
            />
          ))}
      </div>
    );
  }

  return (
    <div
      className={"tree-row" + (activePath === node.path ? " active" : "")}
      style={{ paddingLeft: depth * 12 + 22 }}
      onClick={() => onOpen(node)}
    >
      <span className="tree-icon">
        {node.name.endsWith(".py") ? <FileCode size={13} /> : <File size={13} />}
      </span>
      <span className="tree-name">{node.name}</span>
    </div>
  );
}

export default function FileTree({ nodes, onOpen, activePath, depth = 0 }: Props) {
  if (nodes.length === 0) {
    return <div className="tree-empty">No files</div>;
  }
  return (
    <div className="tree">
      {nodes.map((n) => (
        <TreeNode
          key={n.path}
          node={n}
          onOpen={onOpen}
          activePath={activePath}
          depth={depth}
        />
      ))}
    </div>
  );
}
