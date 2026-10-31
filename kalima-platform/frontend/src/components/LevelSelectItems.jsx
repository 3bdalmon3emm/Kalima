import { useTranslation } from "react-i18next";
import { SelectGroup, SelectItem, SelectLabel } from "@/components/ui/select";
import { groupLevelsByStage, levelTitle } from "@/lib/levelUtils";

// Options for a level <Select>: grouped under their stage, titled in the
// current language.
export default function LevelSelectItems({ levels = [] }) {
    const { i18n } = useTranslation();
    return groupLevelsByStage(levels).map(({ stage, levels: items }) => (
        <SelectGroup key={stage?.id ?? "none"}>
            {stage && <SelectLabel>{levelTitle(stage, i18n.language)}</SelectLabel>}
            {items.map((lvl) => (
                <SelectItem key={lvl.id} value={String(lvl.id)}>
                    {levelTitle(lvl, i18n.language)}
                </SelectItem>
            ))}
        </SelectGroup>
    ));
}
