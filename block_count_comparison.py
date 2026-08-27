import pandas as pd
import matplotlib.pyplot as plt
import numpy as np
from pathlib import Path


# ============================================================
# SETTINGS
# ============================================================

CSV_FILE = "Participant Block Counts Comparion_Final.csv"
OUTPUT_DIR = Path("participant_difference_plots")

# Create output directory if it doesn't exist
OUTPUT_DIR.mkdir(exist_ok=True)


# ============================================================
# 1. LOAD DATA
# ============================================================

csv_path = Path(CSV_FILE)

if not csv_path.exists():
    raise FileNotFoundError(
        f"Could not find '{CSV_FILE}'.\n"
        f"Make sure the CSV is in the same folder as this Python script."
    )

df = pd.read_csv(csv_path)

print("\nColumns found in CSV:")
print(df.columns.tolist())


# ============================================================
# 2. CLEAN THE DIFFERENCE COLUMN
# ============================================================

if "Difference" not in df.columns:
    raise ValueError(
        "The CSV does not contain a column named 'Difference'. "
        f"Columns found: {df.columns.tolist()}"
    )

# Convert Difference to numeric.
# Values such as '#N/A' become NaN.
df["Difference_Clean"] = pd.to_numeric(
    df["Difference"],
    errors="coerce"
)

# Keep only rows with an actual numeric Difference.
difference = df["Difference_Clean"].dropna()

if difference.empty:
    raise ValueError("No numeric values were found in the Difference column.")


# ============================================================
# 3. BASIC SUMMARY
# ============================================================

positive_count = (difference > 0).sum()
zero_count = (difference == 0).sum()
negative_count = (difference < 0).sum()

print("\n" + "=" * 60)
print("DIFFERENCE SUMMARY")
print("=" * 60)

print(f"Total rows in CSV:              {len(df):,}")
print(f"Numeric Difference values:      {len(difference):,}")
print(f"Ignored non-numeric values:     {len(df) - len(difference):,}")

print("\nDifference statistics:")
print(f"Minimum Difference:             {difference.min():,.0f}")
print(f"Maximum Difference:             {difference.max():,.0f}")
print(f"Mean Difference:                {difference.mean():,.2f}")
print(f"Median Difference:              {difference.median():,.2f}")

print("\nDirection of differences:")
print(f"Negative differences:            {negative_count:,}")
print(f"Zero differences:                {zero_count:,}")
print(f"Positive differences:            {positive_count:,}")


# ============================================================
# 4. HISTOGRAM
# ============================================================

plt.figure(figsize=(12, 7))

plt.hist(
    difference,
    bins="auto",
    color="#4472C4",
    edgecolor="black",
    alpha=0.80
)

plt.axvline(
    0,
    color="red",
    linestyle="--",
    linewidth=2,
    label="Zero Difference"
)

plt.title(
    "Distribution of Block Count Differences",
    fontsize=16,
    fontweight="bold"
)

plt.xlabel(
    "Difference (Participant Count - Census Count)",
    fontsize=12
)

plt.ylabel(
    "Number of Blocks",
    fontsize=12
)

plt.grid(
    axis="y",
    linestyle="--",
    alpha=0.35
)

plt.legend()

plt.tight_layout()

histogram_path = OUTPUT_DIR / "difference_histogram.png"
plt.savefig(histogram_path, dpi=300, bbox_inches="tight")
plt.close()

print(f"\nSaved: {histogram_path}")


# ============================================================
# 5. BOX PLOT
# ============================================================

plt.figure(figsize=(10, 7))

box = plt.boxplot(
    difference,
    vert=True,
    patch_artist=True,
    boxprops=dict(
        facecolor="#70AD47",
        alpha=0.75
    ),
    medianprops=dict(
        color="red",
        linewidth=2
    ),
    whiskerprops=dict(
        color="black",
        linewidth=1.5
    ),
    capprops=dict(
        color="black",
        linewidth=1.5
    ),
    flierprops=dict(
        marker="o",
        markerfacecolor="#C00000",
        markeredgecolor="black",
        markersize=5,
        alpha=0.6
    )
)

plt.axhline(
    0,
    color="blue",
    linestyle="--",
    linewidth=2,
    label="Zero Difference"
)

plt.title(
    "Box Plot of Block Count Differences",
    fontsize=16,
    fontweight="bold"
)

plt.ylabel(
    "Difference (Participant Count - Census Count)",
    fontsize=12
)

plt.grid(
    axis="y",
    linestyle="--",
    alpha=0.35
)

plt.legend()

plt.tight_layout()

boxplot_path = OUTPUT_DIR / "difference_boxplot.png"
plt.savefig(boxplot_path, dpi=300, bbox_inches="tight")
plt.close()

print(f"Saved: {boxplot_path}")


# ============================================================
# 6. BAR CHART — FREQUENCY OF EACH DIFFERENCE
# ============================================================

# Count how many blocks have each Difference value
difference_counts = difference.value_counts().sort_index()

plt.figure(figsize=(14, 7))

bars = plt.bar(
    difference_counts.index,
    difference_counts.values,
    color="#5B9BD5",
    edgecolor="black",
    alpha=0.85
)

# Color bars according to direction
for bar, diff_value in zip(bars, difference_counts.index):

    if diff_value < 0:
        bar.set_color("#C00000")       # Red = negative

    elif diff_value == 0:
        bar.set_color("#70AD47")       # Green = zero

    else:
        bar.set_color("#4472C4")       # Blue = positive


plt.axvline(
    0,
    color="black",
    linestyle="--",
    linewidth=1.5
)

plt.title(
    "Frequency of Each Block Count Difference",
    fontsize=16,
    fontweight="bold"
)

plt.xlabel(
    "Difference (Participant Count - Census Count)",
    fontsize=12
)

plt.ylabel(
    "Number of Blocks",
    fontsize=12
)

plt.grid(
    axis="y",
    linestyle="--",
    alpha=0.30
)

plt.tight_layout()

bar_chart_path = OUTPUT_DIR / "difference_frequency_bar_chart.png"
plt.savefig(bar_chart_path, dpi=300, bbox_inches="tight")
plt.close()

print(f"Saved: {bar_chart_path}")


# ============================================================
# 7. ADDITIONAL CHART — POSITIVE / ZERO / NEGATIVE
# ============================================================

direction_counts = pd.Series({
    "Negative": negative_count,
    "Zero": zero_count,
    "Positive": positive_count
})

plt.figure(figsize=(9, 7))

colors = [
    "#C00000",   # Negative
    "#70AD47",   # Zero
    "#4472C4"    # Positive
]

bars = plt.bar(
    direction_counts.index,
    direction_counts.values,
    color=colors,
    edgecolor="black",
    width=0.6
)

# Add count labels above bars
for bar, count in zip(bars, direction_counts.values):

    plt.text(
        bar.get_x() + bar.get_width() / 2,
        bar.get_height(),
        f"{count:,}",
        ha="center",
        va="bottom",
        fontsize=12,
        fontweight="bold"
    )

plt.title(
    "Blocks by Difference Direction",
    fontsize=16,
    fontweight="bold"
)

plt.xlabel(
    "Difference Direction",
    fontsize=12
)

plt.ylabel(
    "Number of Blocks",
    fontsize=12
)

plt.grid(
    axis="y",
    linestyle="--",
    alpha=0.30
)

plt.tight_layout()

direction_path = OUTPUT_DIR / "difference_direction_bar_chart.png"
plt.savefig(direction_path, dpi=300, bbox_inches="tight")
plt.close()

print(f"Saved: {direction_path}")


# ============================================================
# 8. SAVE A CLEANED VERSION OF THE DATA
# ============================================================

# Optional: save only the rows with valid numeric differences
cleaned_df = df[df["Difference_Clean"].notna()].copy()

cleaned_csv_path = OUTPUT_DIR / "cleaned_difference_data.csv"

cleaned_df.to_csv(
    cleaned_csv_path,
    index=False
)

print(f"Saved: {cleaned_csv_path}")


# ============================================================
# 9. FINAL OUTPUT
# ============================================================

print("\n" + "=" * 60)
print("COMPLETE")
print("=" * 60)

print(f"\nAll files have been saved to:")
print(f"  {OUTPUT_DIR.resolve()}")

print("\nGenerated files:")
print("  1. difference_histogram.png")
print("  2. difference_boxplot.png")
print("  3. difference_frequency_bar_chart.png")
print("  4. difference_direction_bar_chart.png")
print("  5. cleaned_difference_data.csv")
