"use client";

import { useState } from "react";

const regions = [
  { code: "ap-northeast-1", label: "Asia Pacific (Tokyo)" },
  { code: "ap-northeast-3", label: "Asia Pacific (Osaka)" },
] as const;

export function RegionSelector() {
  const [region, setRegion] = useState<(typeof regions)[number]["code"]>(
    "ap-northeast-1",
  );

  return (
    <label>
      Virtual Region
      <select
        aria-label="Virtual Region"
        value={region}
        onChange={(event) =>
          setRegion(event.target.value as (typeof regions)[number]["code"])
        }
      >
        {regions.map((item) => (
          <option key={item.code} value={item.code}>
            {item.label} ({item.code})
          </option>
        ))}
      </select>
    </label>
  );
}
