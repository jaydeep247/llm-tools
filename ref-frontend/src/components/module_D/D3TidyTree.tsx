

import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';

export type TreeNode = { 
  text: string; 
  children?: TreeNode[];
  attributes?: Record<string, any>;
};

interface D3TidyTreeProps {
  data: TreeNode;
  height?: number;
  orientation?: 'horizontal' | 'vertical';
  dx?: number; // vertical spacing between nodes
  dy?: number; // horizontal spacing between nodes
  onSelectPath?: (path: string[]) => void;
  recenterKey?: number; // change to force recentring
  expandAll?: boolean; // if true, expand all nodes
  initialExpandDepth?: number; // how many levels to expand initially (default: 2)
}

export default function D3TidyTree({ data, height = 600, orientation = 'horizontal', dx: dxProp, dy: dyProp, onSelectPath, recenterKey, expandAll = false, initialExpandDepth = 1 }: D3TidyTreeProps) {
  const ref = useRef<SVGSVGElement | null>(null);
  const didCenterRef = useRef<boolean>(false);
  const currentTransformRef = useRef<d3.ZoomTransform | null>(null);
  const stableCenterRef = useRef<{ x: number; y: number } | null>(null);
  const collapsedByKeyRef = useRef<Map<string, boolean>>(new Map());
  const lastFocusedNodeKeyRef = useRef<string | null>(null);
  const prevSnapshotRef = useRef<any>(null);

  useEffect(() => {
    if (!data || !ref.current) return;

    // Stable resize check to prevent unnecessary re-renders
    const dataHash = JSON.stringify(data);
    const snapshot = { dataHash, height, orientation, dx: dxProp, dy: dyProp, recenterKey, expandAll, initialExpandDepth };
    if (prevSnapshotRef.current
      && prevSnapshotRef.current.dataHash === snapshot.dataHash
      && prevSnapshotRef.current.height === snapshot.height
      && prevSnapshotRef.current.orientation === snapshot.orientation
      && prevSnapshotRef.current.dx === snapshot.dx // Check props too
      && prevSnapshotRef.current.dy === snapshot.dy
      && prevSnapshotRef.current.recenterKey === snapshot.recenterKey
      && prevSnapshotRef.current.expandAll === expandAll
      && prevSnapshotRef.current.initialExpandDepth === initialExpandDepth) {
      return;
    }
    prevSnapshotRef.current = snapshot;

    collapsedByKeyRef.current = new Map();

    const root = d3.hierarchy<TreeNode>(data, d => d.children);

    // Assign stable keys (Critical for transitions)
    (root as any).eachBefore((n: any) => {
      const parentKey = n.parent?.data?.__key || '';
      const myLabel = (n.data?.text ?? '').replace(/\s+/g, ' ').trim();
      const typeTag = (n.data && (n.data as any).__type) ? String((n.data as any).__type) : 'url';
      const myKey = parentKey ? `${parentKey} > ${typeTag}:${myLabel}` : `${typeTag}:${myLabel}`;
      n.data.__key = myKey;
      n.id = myKey;
    });

    // Initial Collapse State Logic
    (root as any).descendants().forEach((d: any) => {
      d._children = d._children || d.children;
      const key = d.data.__key;

      if (expandAll) {
        d.children = d._children;
        collapsedByKeyRef.current.set(key, false);
      } else {
        const state = collapsedByKeyRef.current.get(key);
        if (state === true) {
          d.children = null; // collapsed
        } else if (state === false) {
          d.children = d._children; // expanded
        } else {
          // Default: Expand to initialExpandDepth
          const shouldCollapse = d.depth >= initialExpandDepth;
          d.children = shouldCollapse ? null : d._children;
          collapsedByKeyRef.current.set(key, shouldCollapse);
        }
      }
    });

    // Layout configuration
    const defaultDx = 50; // Vertical gap (h-layout)
    const defaultDy = 250; // Horizontal gap
    const activeDx = dxProp ?? defaultDx;
    const activeDy = dyProp ?? defaultDy;

    // Dynamic width calculation
    const paddingRight = 400;
    const width = Math.min(2500, (root.height + 1) * activeDy + paddingRight);

    const svg = d3.select(ref.current);
    svg.selectAll('*').remove();

    svg
      .attr('viewBox', [0, 0, width, height])
      .style('font', '14px \"Inter\", \"Segoe UI\", Roboto, sans-serif')
      .style('user-select', 'none')
      .style('background', 'transparent')
      .style('border-radius', '12px');

    const gZoom = svg.append('g');
    const g = gZoom.append('g');

    const zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event: any) => {
        currentTransformRef.current = event.transform;
        gZoom.attr('transform', event.transform.toString());
      });

    svg.call(zoomBehavior);
    if (currentTransformRef.current) {
      svg.call(zoomBehavior.transform as any, currentTransformRef.current);
    }

    const tree = d3.tree<TreeNode>().nodeSize([activeDx, activeDy]);
    
    // Custom link generator - start from right edge of parent node (where + icon is)
    const diagonal = (d: any) => {
      const source = d.source;
      const target = d.target;
      
      // Calculate parent node width (stored in node data)
      const parentWidth = (source as any).width || 200; // Default fallback
      
      // Start point: right edge of parent node
      const sourceX = source.y + parentWidth;
      const sourceY = source.x;
      
      // End point: left edge of child node
      const targetX = target.y;
      const targetY = target.x;
      
      // Create smooth bezier curve from right edge of parent to left edge of child
      return `M ${sourceX},${sourceY}
              C ${(sourceX + targetX) / 2},${sourceY}
                ${(sourceX + targetX) / 2},${targetY}
                ${targetX},${targetY}`;
    };

    let updateSource: any = root;
    if (lastFocusedNodeKeyRef.current) {
      const match = (root as any).descendants().find((n: any) => n.data.__key === lastFocusedNodeKeyRef.current);
      if (match) updateSource = match;
    }

    // Initialize positions relative to height center
    if ((root as any).x0 === undefined) {
      (root as any).x0 = height / 2;
      (root as any).y0 = 0;
    }

    // --- Main Update Function ---
    update(updateSource);

    function update(source: any) {
      const nodes = (root as any).descendants().reverse();
      const links = (root as any).links();

      tree(root as any);

      // --- Vertically Center the Tree ---
      let left: any = root, top: any = root, bottom: any = root;
      (root as any).eachBefore((n: any) => {
        if (n.x < top.x) top = n;
        if (n.x > bottom.x) bottom = n;
        if (n.y < left.y) left = n;
      });

      if (!didCenterRef.current || recenterKey !== undefined) {
        const midY = (top.x + bottom.x) / 2;
        const shiftY = (height / 2) - midY;
        const shiftX = 80; // Fixed left margin

        stableCenterRef.current = { x: shiftX, y: shiftY };
        g.transition().duration(1000).attr('transform', `translate(${shiftX}, ${shiftY})`);

        // Reset scale references for cleanliness
        if (!didCenterRef.current) {
          svg.call(zoomBehavior.transform as any, d3.zoomIdentity.translate(shiftX, shiftY).scale(1));
          currentTransformRef.current = d3.zoomIdentity.translate(shiftX, shiftY).scale(1);
        }
        didCenterRef.current = true;
      }

      // --- Node Logic ---
      const node = g.selectAll<SVGGElement, any>('g.node')
        .data(nodes, (d: any) => d.data.__key);

      const nodeEnter = node.enter().append('g')
        .attr('class', 'node')
        .attr('transform', () => `translate(${source.y0},${source.x0})`)
        .attr('cursor', 'pointer')
        .on('click', (event, d: any) => {
          event.stopPropagation();
          if (onSelectPath) {
            const path: string[] = [];
            let p: any = d;
            while (p) {
              const nodeValue = p.data?.attributes?.full ?? p.data?.text ?? '';
              path.unshift(nodeValue);
              p = p.parent;
            }
            onSelectPath(path);
          }
          lastFocusedNodeKeyRef.current = d.data.__key;
        });

      // 1. Pill Background (Larger)
      nodeEnter.append('rect')
        .attr('rx', 21)
        .attr('ry', 21)
        .attr('x', 0)
        .attr('y', -21)
        .attr('height', 42)
        .attr('width', 10)
        .attr('fill', '#151515')
        .attr('stroke', '#38bdf8')
        .attr('stroke-width', 1.5)
        .style('filter', 'drop-shadow(0 4px 6px rgba(0,0,0,0.5))');

      // 2. Text Label (Larger)
      nodeEnter.append('text')
        .attr('dy', '0.35em')
        .attr('x', 24)
        .attr('text-anchor', 'start')
        .text((d: any) => d.data.text)
        .style('font-weight', '600') // Bolder
        .style('fill', '#f9fafb') // Gray-50 (Brighter)
        .style('font-size', '16px') // Bigger font
        .style('opacity', 0)
        .transition().duration(400).style('opacity', 1);

      // Measure text phase
      nodeEnter.each(function (this: any, d: any) {
        const thisGroup = d3.select(this);
        const txt = thisGroup.select('text').node() as SVGTextElement;
        const width = txt.getComputedTextLength();
        const padding = 60;
        const expanded = !!d.children;
        const collapsed = !!d._children && !d.children;
        const hasKids = expanded || collapsed;

        const buttonSpace = hasKids ? 28 : 0;
        const linkSpace = 24;
        const totalW = width + padding + buttonSpace + linkSpace;

        thisGroup.select('rect').attr('width', totalW);
        (d as any).width = totalW;
      });

      const leftNavGroup = nodeEnter
        .append('g')
        .attr('class', 'nav-left')
        .attr('transform', 'translate(-18, 0)')
        .style('opacity', (d: any) => (d.children ? 1 : 0))
        .style('pointer-events', (d: any) => (d.children ? 'all' : 'none'))
        .on('click', (event, d: any) => {
          event.stopPropagation();
          toggleNode(d);
        });

      leftNavGroup.append('circle')
        .attr('r', 10)
        .attr('fill', '#1f2937')
        .attr('stroke', '#6b7280')
        .attr('stroke-width', 1.5);

      leftNavGroup.append('text')
        .attr('dy', '0.35em')
        .attr('text-anchor', 'middle')
        .text('<')
        .style('font-size', '12px')
        .style('font-weight', '700')
        .style('fill', '#e5e7eb');

      const linkGroup = nodeEnter
        .append('g')
        .attr('class', 'open-link')
        .attr('transform', function (d: any) {
          const w = (d as any).width || 40;
          return `translate(${w - 10}, 0)`;
        })
        .style('opacity', (d: any) => (d._children ? 1 : 0))
        .style('pointer-events', (d: any) => (d._children ? 'all' : 'none'))
        .on('click', (event, d: any) => {
          event.stopPropagation();
          toggleNode(d);
        });

      linkGroup.append('circle')
        .attr('r', 10)
        .attr('fill', '#1f2937')
        .attr('stroke', '#6b7280')
        .attr('stroke-width', 1.5);

      linkGroup.append('text')
        .attr('dy', '0.35em')
        .attr('text-anchor', 'middle')
        .attr('x', 0.5)
        .text('>')
        .style('font-size', '12px')
        .style('font-weight', '700')
        .style('fill', '#e5e7eb');


      // --- Update Transitions (Smoother with longer duration) ---
      const nodeUpdate = (nodeEnter as any).merge(node as any);

      nodeUpdate.transition().duration(600)
        .attr('transform', (d: any) => `translate(${d.y},${d.x})`);

      // Update appearance based on state
      nodeUpdate.each(function (this: any, d: any) {
        const group = d3.select(this);
        const expanded = !!d.children;
        const collapsed = !!d._children && !d.children;
        const hasKids = expanded || collapsed;

        group.select('rect')
          .transition().duration(400)
          .attr('stroke', collapsed ? '#38bdf8' : '#1e293b')
          .attr('fill', '#151515');

        // Smoothly show/hide arrows based on state
        group.select('.nav-left')
          .transition().duration(500)
          .style('opacity', expanded ? 1 : 0)
          .style('pointer-events', expanded ? 'all' : 'none')
          .attr('transform', 'translate(-18, 0)');

        const w = (d as any).width || 40;
        group.select('.open-link')
          .transition().duration(500)
          .style('opacity', collapsed ? 1 : 0)
          .style('pointer-events', collapsed ? 'all' : 'none')
          .attr('transform', `translate(${w - 10}, 0)`);
      });

      // --- Exiting Nodes (Smooth exit animation) ---
      const nodeExit = node.exit().transition().duration(500)
        .attr('transform', () => `translate(${source.y},${source.x})`)
        .remove();

      nodeExit.select('rect').attr('fill-opacity', 0);
      nodeExit.select('text').style('opacity', 0);


      // --- Links (Curved Bezier) ---
      const linksSel = g.selectAll<SVGPathElement, any>('path.link')
        .data(links, (d: any) => d.target.id);

      const linkEnter = linksSel.enter().insert('path', 'g')
        .attr('class', 'link')
        .attr('d', () => {
          const o = { x: source.x0, y: source.y0 };
          return diagonal({ source: o, target: o });
        })
        .attr('fill', 'none')
        .attr('stroke', '#4b5563')
        .attr('stroke-width', 1.5)
        .style('opacity', 0); // Fade in

      const linkUpdate = (linkEnter as any).merge(linksSel as any);

      linkUpdate.transition().duration(600)
        .attr('d', diagonal)
        .style('opacity', 0.4); // Subtle lines

      linksSel.exit().transition().duration(500)
        .attr('d', () => {
          const o = { x: source.x, y: source.y };
          return diagonal({ source: o, target: o });
        })
        .remove();

      // Stash positions
      (root as any).eachBefore((d: any) => {
        d.x0 = d.x;
        d.y0 = d.y;
      });
    }

    function toggleNode(d: any) {
      const hasChildren = d.children || d._children;
      if (!hasChildren) return;

      const wasCollapsed = !d.children;

      if (d.children) {
        d._children = d.children;
        d.children = null;
        collapsedByKeyRef.current.set(d.data.__key, true);
      } else {
        d.children = d._children;
        d._children = null;
        collapsedByKeyRef.current.set(d.data.__key, false);

        const parent = d.parent;
        if (parent && parent.children) {
          parent.children.forEach((sibling: any) => {
            if (sibling === d) return;
            if (sibling.children) {
              sibling._children = sibling.children;
              sibling.children = null;
              collapsedByKeyRef.current.set(sibling.data.__key, true);
            }
          });
        }
      }

      lastFocusedNodeKeyRef.current = d.data.__key;
      update(d);

      if (wasCollapsed && d.children) {
        setTimeout(() => {
          const transform = d3.zoomTransform(svg.node() as Element);
          const scale = transform.k;
          const x = -d.y * scale + width / 3;
          const y = -d.x * scale + height / 2;

          svg.transition().duration(800)
            .call(zoomBehavior.transform as any, d3.zoomIdentity.translate(x, y).scale(scale));
        }, 300);
      }
    }

  }, [data, height, orientation, dxProp, dyProp, recenterKey, expandAll]);

  return (
    <div style={{ borderRadius: 12, overflow: 'hidden', background: 'transparent', width: '100%', height: '100%' }}>
      <svg ref={ref} width="100%" height={height} style={{ display: 'block', outline: 'none' }} />
    </div>
  );
}
