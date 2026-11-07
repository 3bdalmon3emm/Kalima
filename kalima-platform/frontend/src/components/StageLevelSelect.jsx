import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { groupLevelsByStage, levelTitle } from "@/lib/levelUtils";

const stageKey = (stage) => String(stage?.id ?? "none");

// Picks a level in two steps: the stage first, then a level inside it.
// Only active levels are offered, so a stage shows only if it has one.
// `value` and `onChange` carry the level id as a string, like a <Select>.
export default function StageLevelSelect({
    levels = [],
    value,
    onChange,
    stageLabel,
    stagePlaceholder,
    levelLabel,
    levelPlaceholder,
    noStageLabel = "—",
}) {
    const { i18n } = useTranslation();
    const id = useId();
    const groups = groupLevelsByStage(levels.filter((level) => level.active !== false));

    // Until the user picks a stage, follow the stage of the chosen level.
    const [pickedStage, setPickedStage] = useState("");
    const valueGroup = groups.find((g) => g.levels.some((level) => String(level.id) === value));
    const currentStage = pickedStage || (valueGroup ? stageKey(valueGroup.stage) : "");
    const stageLevels = groups.find((g) => stageKey(g.stage) === currentStage)?.levels || [];

    const pickStage = (key) => {
        if (key !== currentStage) onChange("");
        setPickedStage(key);
    };

    return (
        <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
                <Label htmlFor={`${id}-stage`}>{stageLabel}</Label>
                <Select dir={i18n.dir()} value={currentStage} onValueChange={pickStage}>
                    <SelectTrigger id={`${id}-stage`}>
                        <SelectValue placeholder={stagePlaceholder} />
                    </SelectTrigger>
                    <SelectContent>
                        {groups.map(({ stage }) => (
                            <SelectItem key={stageKey(stage)} value={stageKey(stage)}>
                                {stage ? levelTitle(stage, i18n.language) : noStageLabel}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            <div className="grid gap-2">
                <Label htmlFor={`${id}-level`}>{levelLabel}</Label>
                <Select dir={i18n.dir()} value={value || ""} onValueChange={onChange} disabled={!currentStage}>
                    <SelectTrigger id={`${id}-level`}>
                        <SelectValue placeholder={levelPlaceholder} />
                    </SelectTrigger>
                    <SelectContent>
                        {stageLevels.map((level) => (
                            <SelectItem key={level.id} value={String(level.id)}>
                                {levelTitle(level, i18n.language)}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
        </div>
    );
}
