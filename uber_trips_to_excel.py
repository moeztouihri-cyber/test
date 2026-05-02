import pandas as pd
import glob
import os


def load_uber_trips(data_path: str) -> pd.DataFrame:
    """Load Uber trip CSV files from a directory or single file."""
    if os.path.isdir(data_path):
        files = glob.glob(os.path.join(data_path, "*.csv"))
        if not files:
            raise FileNotFoundError(f"No CSV files found in {data_path}")
        df = pd.concat([pd.read_csv(f) for f in files], ignore_index=True)
    else:
        df = pd.read_csv(data_path)
    return df


def clean_trips(df: pd.DataFrame) -> pd.DataFrame:
    """Normalize column names and parse dates."""
    df.columns = [c.strip().lower().replace(" ", "_") for c in df.columns]

    date_cols = [c for c in df.columns if "date" in c or "time" in c]
    for col in date_cols:
        df[col] = pd.to_datetime(df[col], errors="coerce")

    return df


def export_to_excel(df: pd.DataFrame, output_path: str) -> None:
    """Export the DataFrame to an Excel file with basic formatting."""
    with pd.ExcelWriter(output_path, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Trips")

        worksheet = writer.sheets["Trips"]
        for col in worksheet.columns:
            max_len = max(len(str(cell.value or "")) for cell in col) + 2
            worksheet.column_dimensions[col[0].column_letter].width = min(max_len, 40)

    print(f"Exported {len(df)} trips to {output_path}")


def main(data_path: str = "data", output_path: str = "uber_trips.xlsx") -> None:
    df = load_uber_trips(data_path)
    df = clean_trips(df)
    export_to_excel(df, output_path)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Convert Uber trip CSVs to Excel")
    parser.add_argument("data_path", nargs="?", default="data", help="CSV file or folder")
    parser.add_argument("--output", default="uber_trips.xlsx", help="Output Excel file")
    args = parser.parse_args()

    main(args.data_path, args.output)
