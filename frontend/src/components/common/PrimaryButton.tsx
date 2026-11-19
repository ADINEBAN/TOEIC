import { LiquidButton } from "@/src/components/ui/LiquidGlass";

type PrimaryButtonProps = {
  label: string;
  onPress: () => void;
  loading?: boolean;
};

export default function PrimaryButton({
  label,
  onPress,
  loading = false,
}: PrimaryButtonProps) {
  return <LiquidButton label={label} loading={loading} onPress={onPress} variant="primary" />;
}
