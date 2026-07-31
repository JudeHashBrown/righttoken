export type CountryOption = {
  code: string;
  name: string;
};

function buildCountryOptions(): CountryOption[] {
  const names = new Intl.DisplayNames(["zh-CN"], {
    type: "region"
  });
  const options: CountryOption[] = [];
  for (let first = 65; first <= 90; first += 1) {
    for (let second = 65; second <= 90; second += 1) {
      const code =
        String.fromCharCode(first) + String.fromCharCode(second);
      const name = names.of(code);
      if (!name || name === code || code === "ZZ") continue;
      options.push({ code, name });
    }
  }
  return options.sort((left, right) =>
    left.name.localeCompare(right.name, "zh-CN")
  );
}

export const operationalCountryOptions = buildCountryOptions();
