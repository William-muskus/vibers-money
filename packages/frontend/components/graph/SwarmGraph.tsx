'use client';

import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';

type Node = { id: string; role: string; business_id: string };
type Edge = { from: string; to: string };

export default function SwarmGraph({ businessId }: { businessId?: string }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [data, setData] = useState<{ nodes: Node[]; edges: Edge[] }>({ nodes: [], edges: [] });
  const [activeIds, setActiveIds] = useState<Set<string>>(new Set());
  const simulationRef = useRef<d3.Simulation<D3Node, D3Edge> | null>(null);

  useEffect(() => {
    const q = businessId ? `?business_id=${encodeURIComponent(businessId)}` : '';
    fetch(`/api/graph${q}`)
      .then((r) => (r.ok ? r.json() : { nodes: [], edges: [] }))
      .then(setData)
      .catch(() => setData({ nodes: [], edges: [] }));
    const interval = setInterval(() => {
      fetch(`/api/graph${q}`)
        .then((r) => (r.ok ? r.json() : { nodes: [], edges: [] }))
        .then(setData)
        .catch(() => {});
    }, 3000);
    return () => clearInterval(interval);
  }, [businessId]);

  interface D3Node extends d3.SimulationNodeDatum {
    id: string;
    role: string;
    business_id: string;
    x?: number;
    y?: number;
  }
  interface D3Edge extends d3.SimulationLinkDatum<D3Node> {
    from: string;
    to: string;
    source: string | D3Node;
    target: string | D3Node;
  }

  useEffect(() => {
    if (!svgRef.current || data.nodes.length === 0) return;
    const width = svgRef.current.clientWidth || 400;
    const height = 400;

    const nodes: D3Node[] = data.nodes.map((n) => ({ ...n, x: width / 2, y: height / 2 }));
    const nodeById = new Map(nodes.map((n) => [n.id, n]));
    const links: D3Edge[] = data.edges.map((e) => ({
      ...e,
      source: nodeById.get(e.from) ?? e.from,
      target: nodeById.get(e.to) ?? e.to,
    }));

    const simulation = d3
      .forceSimulation<D3Node>(nodes)
      .force(
        'link',
        d3.forceLink<D3Node, D3Edge>(links).id((d) => (d as D3Node).id).distance(80),
      )
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(32));

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    const g = svg.append('g');

    const link = g
      .append('g')
      .attr('class', 'links')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', '#94a3b8')
      .attr('stroke-width', 2)
      .attr('stroke-opacity', 0.8);

    const node = g
      .append('g')
      .attr('class', 'nodes')
      .selectAll('g')
      .data(nodes)
      .join('g')
      .attr('cursor', 'pointer')
      .call(
        d3
          .drag<SVGGElement, D3Node>()
          .on('start', (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on('drag', (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on('end', (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          }),
      );

    node
      .append('circle')
      .attr('r', 24)
      .attr('fill', (d) => (d.role === 'ceo' ? '#3b82f6' : '#64748b'))
      .attr('stroke', (d) => (activeIds.has(d.id) ? '#fbbf24' : '#fff'))
      .attr('stroke-width', (d) => (activeIds.has(d.id) ? 3 : 2));

    node
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', 5)
      .attr('fill', '#fff')
      .attr('font-size', 11)
      .text((d) => d.role);

    simulation.on('tick', () => {
      link
        .attr('x1', (d) => (d.source as D3Node).x ?? 0)
        .attr('y1', (d) => (d.source as D3Node).y ?? 0)
        .attr('x2', (d) => (d.target as D3Node).x ?? 0)
        .attr('y2', (d) => (d.target as D3Node).y ?? 0);
      node.attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });

    simulationRef.current = simulation;
    return () => {
      simulation.stop();
    };
  }, [data, activeIds]);

  return (
    <svg
      ref={svgRef}
      width="100%"
      height="400"
      className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"
    />
  );
}
