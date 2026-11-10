"""Final report figures. Every report figure lives once, in report/figs/.

    uv run python scripts/make_report_figs.py              -> all figures below
    uv run python scripts/make_report_figs.py NAME [NAME]  -> only those (e.g. schematic method_flow)

Made here: story_schematic, method_flow, split_map, training_curves (not in the report), round2_scatter,
rq2_when_transit_income and rq3_time_to_detection (both redrawn from the saved stage-7 CSVs, no re-analysis).
Made elsewhere: rq2_maps_250m.png (scripts/make_fig2.py); height_example.png (moved from
results/height_model_pilot/figs/case_dino_dpt_r025_1.png, made by scripts/eval_height.py).

Aggregated geography only (1 km blocks, ZIPs, 250 m cells); the schematic is drawn, not a real building.
"""

import sys
from pathlib import Path

import geopandas as gpd
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
sys.path.append(str(ROOT / "scripts"))
from viz import PALETTE, style  # noqa: E402

OUT = ROOT / "report/figs"
OUT.mkdir(parents=True, exist_ok=True)
M4 = ROOT / "results/citywide/m4"
style()


def split_map():
    gp = ROOT / "data/interim/splits_citywide.gpkg"
    zips, blocks = gpd.read_file(gp, layer="zips"), gpd.read_file(gp, layer="blocks")
    mask = gpd.read_file(ROOT / "data/interim/study_area_mask.gpkg", layer="mask")
    colors = {"train": PALETTE["primary"], "val": PALETTE["positive"], "test": PALETTE["accent"]}
    fig, ax = plt.subplots(figsize=(5.6, 5.2))
    zips.plot(ax=ax, color="white", edgecolor="0.75", lw=0.4)
    for s, c in colors.items():
        clip = gpd.clip(mask, blocks[blocks.split == s])
        clip.plot(ax=ax, color=c, lw=0, alpha=0.85)
        ax.fill([], [], color=c, label={"train": "train (259 blocks)", "val": "validation (46)",
                                        "test": "sealed test (8 ZIPs, 68 blocks)"}[s])
    zips[zips.test].boundary.plot(ax=ax, color=PALETTE["accent"], lw=0.9)
    ax.legend(loc="lower right", frameon=False, fontsize=8)
    ax.set_title("Study area (152.5 km²) and the 1 km block / ZIP split", loc="left")
    ax.set_axis_off()
    fig.tight_layout()
    fig.savefig(OUT / "split_map.png", dpi=200, bbox_inches="tight")
    plt.close(fig)


def training_curves():
    runs = {"m4_s0": ("original M4 (41k-step schedule)", PALETTE["neutral"], ":"),
            **{f"m4b_s{s}": ("recipe A (amendment 1)" if s == 0 else None, PALETTE["muted"], "-") for s in range(6)},
            "m4s_s0": ("config S, seed 0 = final M4", PALETTE["accent"], "-"),
            "m4s_s1": ("config S, seed 1", PALETTE["primary"], "-")}
    fig, axes = plt.subplots(1, 2, figsize=(8.6, 3.2), sharex=True)
    for tag, (lab, col, ls) in runs.items():
        f = M4 / f"unitcls_{tag}_train.csv"
        if not f.exists():
            continue
        d = pd.read_csv(f)
        d = d[d.iter <= 8000]
        lw = 1.8 if tag.startswith("m4s") else 1.1
        for ax, k in zip(axes, ("val_ap_grew", "val_ap_popup")):
            ax.plot(d.iter, d[k], color=col, ls=ls, lw=lw, marker="o", ms=2.5, label=lab)
            if (M4 / f"DEAD_{tag}").exists():
                ax.plot(d.iter.iloc[-1], d[k].iloc[-1], "x", color=PALETTE["neutral"], ms=6)
    axes[0].axhline(0.15, color=PALETTE["neutral"], lw=0.8, ls="--")
    axes[0].text(8000, 0.16, "guard: stop below 0.15", ha="right", fontsize=7, color=PALETTE["neutral"])
    axes[0].set(title="Validation AP, grew (× = run stopped by guard)", xlabel="training step", ylabel="AP")
    axes[1].set(title="Validation AP, vertical addition (pop-up)", xlabel="training step")
    axes[1].legend(frameon=False, fontsize=7, loc="upper left")
    fig.tight_layout()
    fig.savefig(OUT / "training_curves.png", dpi=200, bbox_inches="tight")
    plt.close(fig)


def round2_scatter():
    import m4_test as T  # helpers only; does not run the test (the lock stays untouched)
    df = pd.read_parquet(ROOT / "data/interim/unitcls_preds/m4s_s0_ROUND2_2022_2025.parquet")
    thr = {"grew": float(df.thr_grew.iloc[0]), "popup": float(df.thr_popup.iloc[0])}
    d = T.geography(T.model_flags(T.with_truth(df, "lidar_change_city", 2022, 2025), thr))
    hr = pd.read_csv(ROOT / "results/citywide/highrise_all.csv")
    flagged = set(hr[(hr.unit == "c100") & hr.flagged].key)
    d = d[~d.c100.isin(flagged)]
    cal = pd.read_csv(M4 / "round2_grid.csv")
    cal = cal[(cal.tag == "m4s_s0") & (cal.part == "main") & (cal.scale == "250 m")].set_index("class")
    agg = d.groupby("c250").agg(**{f"{p}_{k}": (f"{p}_{k}", "sum") for k in T.CLASSES for p in ("m", "t")})
    fig, axes = plt.subplots(1, 3, figsize=(8.6, 2.9))
    for ax, (k, name) in zip(axes, (("new", "New construction"), ("grew", "Any growth (grew)"),
                                    ("popup", "Vertical addition (pop-up)"))):
        est, tru = agg[f"m_{k}"] * cal.loc[k, "calibration_factor"], agg[f"t_{k}"]
        jit = np.random.default_rng(0).uniform(-0.15, 0.15, len(tru))
        ax.scatter(tru + jit, est, s=9, alpha=0.5, color=PALETTE["primary"], lw=0)
        m = max(tru.max(), est.max()) + 1
        ax.plot([0, m], [0, m], color=PALETTE["neutral"], lw=0.8, ls="--")
        ax.set(xlim=(-0.5, m), ylim=(-0.5, m), xlabel="LiDAR count per 250 m cell")
        ax.set_title(f"{name}\nr = {cal.loc[k, 'r_calibrated']:.2f}; total {est.sum():.0f} vs {tru.sum():.0f}",
                     loc="left", fontsize=9)
    axes[0].set_ylabel("model estimate (calibrated)")
    fig.suptitle("Sealed test, 2022→2025, 8 ZIPs, 594 cells (final model)", x=0.01, ha="left", fontsize=10)
    fig.tight_layout()
    fig.savefig(OUT / "round2_scatter.png", dpi=200, bbox_inches="tight")
    plt.close(fig)


S7 = ROOT / "results/citywide/stage7"
BANDS = ["< 400 m", "400–800 m", "800–1,600 m", "> 1,600 m"]


def rq2_when_transit_income():
    yr = pd.read_csv(S7 / "rq2_yearly_new_shared_units.csv")  # one fixed unit set (scripts/report_checks.py)
    rb = pd.read_csv(S7 / "rq2_rates_by_rail_distance.csv")
    q = pd.read_csv(S7 / "rq2_rates_by_income.csv")
    fig, axes = plt.subplots(2, 2, figsize=(10, 7))
    a = axes.ravel()
    lab = {2019: "2019*", 2020: "2020*", 2022: "2021–22\n(avg)", 2023: "2023*", 2024: "2024*", 2025: "2025"}
    for anchor, c in ((2018, PALETTE["primary"]), (2022, PALETTE["accent"])):
        d = yr[yr.anchor == anchor]
        a[0].bar([lab[y] for y in d.year], d.per_1000_per_year, color=c, label=f"{anchor} LiDAR anchor")
    a[0].set(title=f"(a) New construction per year ({int(yr.units.iloc[0]):,} units)",
             ylabel="per 1,000 units per year")
    x = np.arange(len(BANDS))
    for k, (p, c) in enumerate(zip(("2018–2022", "2022–2025"), (PALETTE["primary"], PALETTE["positive"]))):
        d = rb[rb.period == p].set_index("rail_band").reindex(BANDS)
        a[1].bar(x + k * 0.2 - 0.3, d.new_per_1000_per_year, 0.2, color=c, label=f"new {p}")
        a[1].bar(x + k * 0.2 + 0.1, d.popup_per_1000_per_year, 0.2, color=c, alpha=0.45, label=f"pop-up {p}")
    a[1].set_xticks(x, BANDS)
    a[1].set(title="(b) By distance to rail-type stop", ylabel="per 1,000 units per year")
    for ax, e, t in ((a[2], "new", "(c) New construction by income quintile"),
                     (a[3], "popup", "(d) Pop-ups by income quintile")):
        for k, (name, short, c) in enumerate((("baseline income 2015–19", "baseline income", PALETTE["primary"]),
                                              ("real income change", "real income change", PALETTE["accent"]))):
            d = q[q.by == name]
            ax.bar(np.arange(5) + (k - 0.5) * 0.38, d[f"{e}_per_1000_per_year"], 0.38, color=c,
                   label=f"quintile of {short}")
        ax.set_xticks(np.arange(5), ["Q1 (low)", "Q2", "Q3", "Q4", "Q5 (high)"])
        ax.set(title=t, ylabel="per 1,000 units per year")
    for ax in a:
        t = ax.get_title()
        ax.set_title("")
        ax.set_title(t, loc="left", fontsize=10)
        ax.legend(fontsize=8, frameon=False)
    fig.tight_layout()
    fig.savefig(OUT / "rq2_when_transit_income.png", dpi=200, bbox_inches="tight")
    plt.close(fig)


def rq3_time_to_detection():
    tt = pd.read_csv(S7 / "rq3_time_to_detection.csv")
    fig, ax = plt.subplots(figsize=(6.5, 3.8))
    cols = (PALETTE["primary"], PALETTE["accent"], PALETTE["positive"], PALETTE["neutral"])
    for (_, r), c in zip(tt.iterrows(), cols):
        ks = [k for k in range(0, 7) if r.issue_year + k <= 2025]
        ax.plot(ks, [r[f"detected_within_{k}y"] for k in ks], "-o", ms=4, color=c,
                label=f"issued {int(r.issue_year)} (n={int(r.units)})")
    ax.set(xlabel="years after permit issue", ylabel="share with visible new construction", ylim=(0, 1))
    ax.set_title("New-construction permits: time to visible construction", loc="left", fontsize=10)
    ax.legend(fontsize=8, frameon=False)
    fig.tight_layout()
    fig.savefig(OUT / "rq3_time_to_detection.png", dpi=200, bbox_inches="tight")
    plt.close(fig)


ROOF, LOT, NEW = "#8a96a3", "#e9e3cf", PALETTE["accent"]


def story_schematic():
    """Three lots seen from above (aerial image) and from the side (height, what LiDAR measures)."""
    from matplotlib.patches import Rectangle
    cases = [("Before", (2, 0, 2), None),
             ("New construction", (2, 3, 2), 1),
             ("Pop-up (extra storey)", (2, 0, 3), 2)]
    fig, axes = plt.subplots(2, 3, figsize=(9, 4.6), gridspec_kw={"height_ratios": [1, 1.15]})
    for j, (title, storeys, changed) in enumerate(cases):
        top, side = axes[0, j], axes[1, j]
        for i, s in enumerate(storeys):
            x0 = i * 1.0
            # from above: a roof if built, a lot if vacant; a pop-up roof looks like the old roof
            fc = LOT if s == 0 else (NEW if (changed == i and j == 1) else ROOF)
            top.add_patch(Rectangle((x0 + 0.05, 0.1), 0.9, 1.6, fc=fc, ec="white", lw=1.5))
            if j == 2 and i == 2:  # the roof that gained a storey: same as before from above
                top.add_patch(Rectangle((x0 + 0.05, 0.1), 0.9, 1.6, fc="none", ec=NEW, lw=2, ls="--"))
            # from the side: storeys as stacked blocks; changed storeys in colour
            for k in range(s):
                new_block = (j == 1 and i == 1) or (j == 2 and i == 2 and k == 2)
                side.add_patch(Rectangle((x0 + 0.05, k * 0.8), 0.9, 0.8, fc=NEW if new_block else ROOF,
                                         ec="white", lw=1.5))
        side.axhline(0, color=PALETTE["neutral"], lw=1)
        for ax in (top, side):
            ax.set_xlim(-0.05, 3.05)
            ax.set_aspect("equal")
            ax.axis("off")
        top.set_ylim(0, 1.8)
        side.set_ylim(-0.1, 2.6)
        top.set_title(title, fontsize=11, fontweight="bold", color=NEW if changed is not None else PALETTE["neutral"])
        verdict = {0: None, 1: ("clearly visible from above", PALETTE["positive"]),
                   2: ("nearly invisible from above", NEW)}[j]
        if verdict:
            top.text(1.5, -0.12, verdict[0], ha="center", va="top", fontsize=9, color=verdict[1],
                     fontweight="bold")
    axes[0, 0].text(-0.25, 0.9, "From above\n(aerial image)", ha="right", va="center", fontsize=10,
                    color=PALETTE["primary"], fontweight="bold")
    axes[1, 0].text(-0.25, 1.2, "From the side\n(height: LiDAR)", ha="right", va="center", fontsize=10,
                    color=PALETTE["primary"], fontweight="bold")
    for j in (1, 2):
        axes[1, j].text(1.5, -0.25, "measured by LiDAR", ha="center", va="top", fontsize=9,
                        color=PALETTE["positive"], fontweight="bold")
    fig.subplots_adjust(left=0.16, right=0.99, top=0.92, bottom=0.08, wspace=0.12, hspace=0.12)
    fig.savefig(OUT / "story_schematic.png", dpi=200, bbox_inches="tight")
    plt.close(fig)


def method_flow():
    from matplotlib.patches import FancyBboxPatch
    fig, ax = plt.subplots(figsize=(11.5, 3.7))
    ax.set_xlim(0, 16.8)
    ax.set_ylim(0, 5)
    ax.axis("off")
    light = {"primary": "#dce8f1", "positive": "#d8efec", "accent": "#f6dadd", "neutral": "#e3e6e9"}

    def box(xc, yc, w, h, text, col):
        ax.add_patch(FancyBboxPatch((xc - w / 2, yc - h / 2), w, h, boxstyle="round,pad=0.04,rounding_size=0.15",
                                    fc=light[col], ec=PALETTE[col], lw=1.6))
        ax.text(xc, yc, text, ha="center", va="center", fontsize=9.5, color="#1d2730")

    def arrow(p, q, label=None, dy=0.18, dx=0.0):
        ax.annotate("", xy=q, xytext=p, arrowprops={"arrowstyle": "-|>", "color": PALETTE["neutral"], "lw": 1.3})
        if label:
            ax.text((p[0] + q[0]) / 2 + dx, (p[1] + q[1]) / 2 + dy, label, ha="center", fontsize=8.5,
                    color=PALETTE["neutral"], style="italic")

    box(1.3, 3.7, 2.3, 1.15, "LiDAR\n2018 · 2022 · 2025\n(+ 2010, 2015)", "primary")
    box(1.3, 1.3, 2.3, 1.0, "Aerial imagery\nevery spring", "positive")
    box(4.3, 3.7, 2.2, 1.0, "Change labels\nper building unit", "primary")
    box(7.0, 2.5, 2.5, 1.2, "Bi-temporal DINOv3\nunit classifier", "neutral")
    box(9.8, 2.5, 2.3, 1.25, "Sealed test\n2022→2025\nr ≥ 0.8 at 250 m?", "neutral")
    box(13.0, 3.75, 3.0, 1.2, "New construction: yes\nmodel fills 2019, 2020,\n2023, 2024", "positive")
    box(13.0, 1.25, 3.0, 1.0, "Pop-ups: no\nLiDAR years only", "accent")
    box(15.8, 2.5, 1.4, 1.2, "RQ2\nRQ3", "primary")
    arrow((2.45, 3.7), (3.2, 3.7))
    arrow((5.4, 3.55), (6.2, 3.1), "labels", dy=0.05, dx=0.55)
    arrow((2.45, 3.3), (5.75, 2.65), "anchor height", dy=-0.42)
    arrow((2.45, 1.4), (5.75, 2.2), "two images", dy=-0.38)
    arrow((8.25, 2.5), (8.65, 2.5))
    arrow((10.95, 2.8), (11.5, 3.55))
    arrow((10.95, 2.2), (11.5, 1.45))
    arrow((14.5, 3.5), (15.1, 2.95))
    arrow((14.5, 1.5), (15.1, 2.05))
    fig.savefig(OUT / "method_flow.png", dpi=200, bbox_inches="tight")
    plt.close(fig)


FIGS = {"schematic": story_schematic, "method_flow": method_flow, "split_map": split_map,
        "training_curves": training_curves, "round2_scatter": round2_scatter,
        "rq2_when_transit_income": rq2_when_transit_income, "rq3_time_to_detection": rq3_time_to_detection}

if __name__ == "__main__":
    for name in sys.argv[1:] or FIGS:
        FIGS[name]()
    print(*sorted(p.name for p in OUT.glob("*.png")))
