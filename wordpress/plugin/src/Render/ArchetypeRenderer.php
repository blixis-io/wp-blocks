<?php
/** Renderer contract for definition archetypes.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Render;

\defined( 'ABSPATH' ) || exit;

interface ArchetypeRenderer extends ElementRenderer {
	/** Return whether this renderer supports an archetype.
	 *
	 * @param string $archetype Definition archetype.
	 */
	public function supports( string $archetype ): bool;
}
