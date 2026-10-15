import { Tooltip, TooltipContent, TooltipTrigger } from '@blixis/wp-editor-ui';

export function ElementId({ id, tooltip = true }: { id: string; tooltip?: boolean }) {
  const label = (
    <span className="blx-outline-id" aria-label={id}>
      {id}
    </span>
  );
  if (!tooltip) return label;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{label}</TooltipTrigger>
      <TooltipContent>{id}</TooltipContent>
    </Tooltip>
  );
}
