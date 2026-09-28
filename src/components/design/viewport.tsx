"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { Design } from "@/lib/design/document";
import type { DesignBuild } from "@/lib/design/geometry";

type Props = { build: DesignBuild; design: Design; selected: string; view: number; onSelect: (id: string) => void };

export default function Viewport({ build, design, selected, view, onSelect }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const current = useRef({ build, design, selected, onSelect });
  const runtime = useRef<{ update: () => void; reset: () => void } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { current.current = { build, design, selected, onSelect }; runtime.current?.update(); }, [build, design, selected, onSelect]);

  useEffect(() => {
    const element = host.current!;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false }); }
    catch { queueMicrotask(() => setError("3D表示を開始できません。WebGL対応のブラウザをお使いください。寸法編集と保存・出力は利用できます。")); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0xf7f8fa);
    element.appendChild(renderer.domElement);
    renderer.domElement.setAttribute("aria-label", "おうちの3Dプレビュー。ドラッグで回転、ピンチで拡大できます。");
    renderer.domElement.setAttribute("role", "img");
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.001, 10);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.minDistance = 0.08; controls.maxDistance = 2;
    controls.maxPolarAngle = Math.PI / 2;
    const group = new THREE.Group(); scene.add(group);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8d97a6, 2.5));
    const light = new THREE.DirectionalLight(0xffffff, 3); light.position.set(-0.3, 0.7, 0.5); scene.add(light);
    const grid = new THREE.GridHelper(0.8, 40, 0xb8c1cf, 0xe0e5ed); grid.position.y = -0.001; scene.add(grid);
    const render = () => renderer.render(scene, camera);
    controls.addEventListener("change", render);
    function clear() {
      group.traverse((node) => {
        if (node instanceof THREE.Mesh || node instanceof THREE.LineSegments) {
          node.geometry.dispose();
          const materials = Array.isArray(node.material) ? node.material : [node.material];
          materials.forEach((material) => material.dispose());
        }
      });
      group.clear();
    }
    function update() {
      clear();
      const { build, design, selected } = current.current;
      for (const part of build.parts) {
        const p = new Float32Array(part.positions.length);
        for (let i = 0; i < p.length; i += 3) p.set([
          (part.positions[i] + part.position[0] - design.house.width / 2) / 1000,
          (part.positions[i + 2] + part.position[2]) / 1000,
          -(part.positions[i + 1] + part.position[1] - design.house.depth / 2) / 1000,
        ], i);
        const indexed = new THREE.BufferGeometry();
        indexed.setAttribute("position", new THREE.BufferAttribute(p, 3));
        indexed.setIndex(new THREE.BufferAttribute(part.indices, 1));
        const geometry = indexed.toNonIndexed(); indexed.dispose(); geometry.computeVertexNormals();
        const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: part.color, roughness: 0.85 }));
        mesh.userData.partId = part.id; group.add(mesh);
        if (part.id === selected) {
          const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({ color: 0x1d4ed8 }));
          group.add(edges);
        }
      }
      render();
    }
    function reset() {
      const h = current.current.design.house;
      const size = Math.max(h.width, h.depth, h.height + h.roofRise) / 1000;
      controls.target.set(0, (h.height + h.roofRise) / 2200, 0);
      camera.position.set(size * 1.55, size * 1.25, size * 2.05);
      controls.update(); render();
    }
    const resize = new ResizeObserver(() => {
      const width = element.clientWidth, height = element.clientHeight;
      renderer.setSize(width, height); camera.aspect = width / Math.max(1, height); camera.updateProjectionMatrix(); render();
    });
    resize.observe(element);
    const ray = new THREE.Raycaster();
    let down = [0, 0];
    const pointerDown = (event: PointerEvent) => { down = [event.clientX, event.clientY]; };
    const pointerUp = (event: PointerEvent) => {
      if (Math.hypot(event.clientX - down[0], event.clientY - down[1]) > 5) return;
      const rect = renderer.domElement.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2), camera);
      const part = ray.intersectObjects(group.children).find((hit) => hit.object.userData.partId)?.object.userData.partId;
      if (part) current.current.onSelect(part);
    };
    const lost = (event: Event) => { event.preventDefault(); setError("3D表示が中断しました。設計を保存してからページを開き直してください。"); };
    renderer.domElement.addEventListener("pointerdown", pointerDown);
    renderer.domElement.addEventListener("pointerup", pointerUp);
    renderer.domElement.addEventListener("webglcontextlost", lost);
    runtime.current = { update, reset }; update(); reset();
    return () => {
      runtime.current = null; resize.disconnect(); controls.dispose(); clear();
      grid.geometry.dispose(); (grid.material as THREE.Material).dispose();
      renderer.domElement.removeEventListener("pointerdown", pointerDown);
      renderer.domElement.removeEventListener("pointerup", pointerUp);
      renderer.domElement.removeEventListener("webglcontextlost", lost);
      renderer.dispose(); renderer.domElement.remove();
    };
  }, []);
  useEffect(() => { runtime.current?.reset(); }, [view]);
  return <div className="relative">
    <div ref={host} className="h-80 w-full overflow-hidden sm:h-96 lg:h-[480px]" />
    {error && <p role="alert" className="absolute inset-x-0 top-0 bg-white p-4 text-sm text-danger">{error}</p>}
  </div>;
}
