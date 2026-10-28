import pandas as pd

df = pd.read_excel("bas26_codes_ny_including_aia.xlsx")

df.to_csv("bas26_codes_ny_including_aia.csv", index=False)
