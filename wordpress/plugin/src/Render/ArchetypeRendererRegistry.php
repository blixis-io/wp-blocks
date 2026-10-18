<?php
/** Resolves definition archetypes to renderers.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Render;

use Blixis\Builder\Registry\ElementDefinitionRegistry;
\defined( 'ABSPATH' ) || exit;

/** Registry that maps declared archetypes to concrete renderer implementations. */
final class ArchetypeRendererRegistry {
	/** Registered renderers by archetype.
	 *
	 * @var array<string,ArchetypeRenderer>
	 */
	private array $renderers = [];
	/** Create a registry.
	 *
	 * @param ElementDefinitionRegistry $definitions Definition metadata.
	 * @param ElementRenderer           $fallback Safe fallback renderer.
	 */
	public function __construct( private readonly ElementDefinitionRegistry $definitions, private readonly ElementRenderer $fallback ) {}
	/** Register a renderer for every archetype it supports.
	 *
	 * @param ArchetypeRenderer $renderer Renderer.
	 */
	public function register( ArchetypeRenderer $renderer ): void {
		foreach ( $this->definitions->all() as $definition ) {
			$key = (string) ( $definition['archetype'] ?? '' );
			if ( '' !== $key && $renderer->supports( $key ) ) {
				$this->renderers[ $key ] = $renderer;
			}
		} }
	/** Resolve the renderer for an element type.
	 *
	 * @param string $type Element type.
	 */
	public function resolve( string $type ): ElementRenderer {
		$definition = $this->definitions->get( $type );
		$key        = is_array( $definition ) ? (string) ( $definition['archetype'] ?? '' ) : '';
		return $this->renderers[ $key ] ?? $this->fallback; }
}
