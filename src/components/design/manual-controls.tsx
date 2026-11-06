"use client";

import { Input } from "@/components/ui/input";
import type { Design } from "@/lib/design/document";
import { NumberField, Toggle, ColorField } from "./fields";
import { FurnitureEditor } from "./furniture-editor";
import { CustomPartsEditor } from "./custom-parts-editor";

export function ManualControls({
  design: d,
  update,
}: {
  design: Design;
  update: (value: Design) => boolean;
}) {
  const house = <K extends keyof Design["house"]>(
    key: K,
    value: Design["house"][K],
  ) => update({ ...d, house: { ...d.house, [key]: value } });
  const shelf = <K extends keyof Design["shelf"]>(
    key: K,
    value: Design["shelf"][K],
  ) => update({ ...d, shelf: { ...d.shelf, [key]: value } });
  return (
    <section aria-label="おうちの編集" className="space-y-5">
      <label className="flex flex-col gap-2 text-sm font-semibold">
        設計の名前
        <Input
          key={d.name}
          defaultValue={d.name}
          maxLength={80}
          onBlur={(e) => {
            if (!update({ ...d, name: e.target.value }))
              e.currentTarget.value = d.name;
          }}
        />
      </label>
      <label className="flex flex-col gap-2 text-sm font-semibold">
        制作対象
        <select
          aria-label="制作対象"
          className="min-h-11 border border-line bg-white px-3"
          value={d.scene}
          onChange={(e) =>
            update({ ...d, scene: e.target.value as Design["scene"] })
          }
        >
          <option value="house">おうちと家具</option>
          <option value="object">単体の家具・装備</option>
        </select>
      </label>
      {d.scene === "object" && (
        <p className="text-sm text-muted-foreground">
          床・壁・屋根を外して、部品だけを制作・保存します。おうちの設定は保持されます。
        </p>
      )}
      {d.scene === "house" && (
        <>
          <fieldset className="border-t border-line pt-3">
            <legend className="text-balance pr-3 font-semibold">
              おうちの寸法
            </legend>
            <p className="mb-3 text-sm text-muted-foreground">
              単位はmm。入力するとプレビューに反映されます。
            </p>
            <div className="grid grid-cols-2 gap-3">
              <NumberField
                label="幅"
                value={d.house.width}
                min={80}
                max={400}
                onChange={(n) => house("width", n)}
              />
              <NumberField
                label="奥行き"
                value={d.house.depth}
                min={80}
                max={400}
                onChange={(n) => house("depth", n)}
              />
              <NumberField
                label="壁の高さ"
                value={d.house.height}
                min={80}
                max={350}
                onChange={(n) => house("height", n)}
              />
              <NumberField
                label="板厚"
                value={d.house.thickness}
                min={1}
                max={8}
                onChange={(n) => house("thickness", n)}
              />
            </div>
          </fieldset>
          <fieldset className="border-t border-line pt-3">
            <legend className="text-balance pr-3 font-semibold">
              部品と色
            </legend>
            <div className="grid grid-cols-2 gap-x-3">
              <Toggle
                label="左の壁"
                checked={d.house.leftWall}
                onChange={(v) => house("leftWall", v)}
              />
              <Toggle
                label="右の壁"
                checked={d.house.rightWall}
                onChange={(v) => house("rightWall", v)}
              />
            </div>
            <Toggle
              label="屋根をつける"
              checked={d.house.roof}
              onChange={(v) => house("roof", v)}
            />
            {d.house.roof && (
              <>
                <NumberField
                  label="屋根の立ち上がり"
                  value={d.house.roofRise}
                  min={0}
                  max={100}
                  onChange={(n) => house("roofRise", n)}
                />
                <p className="mt-1 text-sm text-muted-foreground">
                  0mmで平らな屋根になります。
                </p>
              </>
            )}
            {d.house.roof && d.house.roofRise > 0 && (
              <Toggle
                label="壁と屋根の隙間を埋める"
                checked={d.house.gables}
                onChange={(v) => house("gables", v)}
              />
            )}
            <div className="mt-3 space-y-1">
              <ColorField
                label="壁の色"
                value={d.house.wallColor}
                onChange={(v) => house("wallColor", v)}
              />
              <ColorField
                label="床の色"
                value={d.house.floorColor}
                onChange={(v) => house("floorColor", v)}
              />
              <ColorField
                label="屋根の色"
                value={d.house.roofColor}
                onChange={(v) => house("roofColor", v)}
              />
            </div>
          </fieldset>
          <fieldset className="border-t border-line pt-3">
            <legend className="text-balance pr-3 font-semibold">窓</legend>
            <Toggle
              label="奥の壁に窓をつける"
              checked={d.window.enabled}
              onChange={(v) =>
                update({ ...d, window: { ...d.window, enabled: v } })
              }
            />
            {d.window.enabled && (
              <label className="mb-3 flex flex-col gap-1 text-sm font-medium">
                窓の形
                <select
                  aria-label="窓の形"
                  className="min-h-11 border border-line bg-white px-3"
                  value={d.window.shape}
                  onChange={(e) =>
                    update({
                      ...d,
                      window: {
                        ...d.window,
                        shape: e.target.value as Design["window"]["shape"],
                      },
                    })
                  }
                >
                  <option value="rectangle">四角</option>
                  <option value="ellipse">
                    丸・楕円（幅と高さが同じなら真円）
                  </option>
                </select>
              </label>
            )}
            {d.window.enabled && (
              <div className="grid grid-cols-2 gap-3">
                <NumberField
                  label="窓の幅"
                  value={d.window.width}
                  min={10}
                  max={200}
                  onChange={(v) =>
                    update({ ...d, window: { ...d.window, width: v } })
                  }
                />
                <NumberField
                  label="窓の高さ"
                  value={d.window.height}
                  min={10}
                  max={200}
                  onChange={(v) =>
                    update({ ...d, window: { ...d.window, height: v } })
                  }
                />
              </div>
            )}
          </fieldset>
        </>
      )}
      <fieldset className="border-t border-line pt-3">
        <legend className="text-balance pr-3 font-semibold">棚</legend>
        <Toggle
          label="棚を置く"
          checked={d.shelf.enabled}
          onChange={(v) => shelf("enabled", v)}
        />
        {d.shelf.enabled && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <NumberField
                label="棚の幅"
                value={d.shelf.width}
                min={20}
                max={200}
                onChange={(n) => shelf("width", n)}
              />
              <NumberField
                label="棚の奥行き"
                value={d.shelf.depth}
                min={15}
                max={150}
                onChange={(n) => shelf("depth", n)}
              />
              <NumberField
                label="棚の高さ"
                value={d.shelf.height}
                min={20}
                max={200}
                onChange={(n) => shelf("height", n)}
              />
              <NumberField
                label="左端からの位置"
                value={d.shelf.x}
                min={0}
                max={350}
                onChange={(n) => shelf("x", n)}
              />
              <NumberField
                label="手前からの位置"
                value={d.shelf.y}
                min={0}
                max={350}
                onChange={(n) => shelf("y", n)}
              />
            </div>
            <ColorField
              label="棚の色"
              value={d.shelf.color}
              onChange={(v) => shelf("color", v)}
            />
          </>
        )}
      </fieldset>
      <details className="border-t border-line">
        <summary className="min-h-11 cursor-pointer py-3 font-semibold">
          家具・自由形状
        </summary>
        <div className="space-y-5 pb-4">
          <FurnitureEditor design={d} update={update} />
          <CustomPartsEditor design={d} update={update} />
        </div>
      </details>
      <details className="border-t border-line pt-2">
        <summary className="min-h-11 cursor-pointer py-3 font-semibold">
          ぬい・プリンタの寸法
        </summary>
        <p className="mb-3 text-sm text-muted-foreground">
          初期値は15cmぬいの目安です。腕・足を含め、飾る姿勢で測ってください。
        </p>
        <div className="grid grid-cols-2 gap-3">
          {(["width", "depth", "height"] as const).map((key, i) => (
            <NumberField
              key={key}
              label={`ぬいの${["幅", "奥行き", "高さ"][i]}`}
              value={d.nui[key]}
              min={10}
              max={300}
              onChange={(n) => update({ ...d, nui: { ...d.nui, [key]: n } })}
            />
          ))}
        </div>
        <p className="my-3 text-sm text-muted-foreground">
          プリンタの造形可能寸法。初期値256mmは仮の値です。
        </p>
        <div className="grid grid-cols-2 gap-3">
          {(["width", "depth", "height"] as const).map((key, i) => (
            <NumberField
              key={key}
              label={`造形範囲の${["幅", "奥行き", "高さ"][i]}`}
              value={d.bed[key]}
              min={80}
              max={500}
              onChange={(n) => update({ ...d, bed: { ...d.bed, [key]: n } })}
            />
          ))}
        </div>
      </details>
    </section>
  );
}
