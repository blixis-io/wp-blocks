<?php
/** Non-destructive server gate for premium feature edits.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Registry;

\defined( 'ABSPATH' ) || exit;

/** Checks changed premium nodes and translations without blocking unrelated edits or deletion. */
final class CapabilityEditPolicy {
	/** Create the policy.
	 *
	 * @param ElementDefinitionRegistry $definitions Generated element definitions.
	 * @param FeatureCapabilityGate     $gate Server capability gate.
	 */
	public function __construct(
		private readonly ElementDefinitionRegistry $definitions,
		private readonly FeatureCapabilityGate $gate
	) {}

	/** Whether a layout update only creates or changes capabilities available to the current add-ons.
	 *
	 * @param ?\stdClass $before Previous layout.
	 * @param \stdClass  $after Submitted layout.
	 */
	public function allows_layout_update( ?\stdClass $before, \stdClass $after ): bool {
		$previous = self::layout_nodes( $before );
		$current  = self::layout_nodes( $after );
		foreach ( $current as $id => $node ) {
			$capability = $this->capability_for_type( $node['type'] );
			if ( null === $capability ) {
				continue;
			}
			$old = $previous[ $id ] ?? null;
			if ( null !== $old && self::same_layout_node( $id, $old, $node, $previous, $current ) ) {
				continue;
			}
			if ( ! $this->gate->allows( $capability ) ) {
				return false;
			}
		}
		return true;
	}

	/** Whether this layout contains an element whose edit decision depends on its previous value.
	 *
	 * @param \stdClass $layout Submitted layout.
	 */
	public function requires_layout_baseline( \stdClass $layout ): bool {
		foreach ( self::layout_nodes( $layout ) as $node ) {
			if ( null !== $this->capability_for_type( $node['type'] ) ) {
				return true;
			}
		}
		return false;
	}

	/** Whether a locale stream changes only content for capabilities available to the current add-ons.
	 *
	 * @param ?\stdClass $layout Current layout.
	 * @param ?\stdClass $before Previous content stream.
	 * @param \stdClass  $after Submitted content stream.
	 */
	public function allows_content_update( ?\stdClass $layout, ?\stdClass $before, \stdClass $after ): bool {
		$types = [];
		foreach ( self::layout_nodes( $layout ) as $id => $node ) {
			$types[ $id ] = $node['type'];
		}
		$old_entries = self::content_entries( $before );
		$new_entries = self::content_entries( $after );
		foreach ( $new_entries as $id => $entry ) {
			if ( isset( $old_entries[ $id ] ) && self::canonical( $old_entries[ $id ] ) === self::canonical( $entry ) ) {
				continue;
			}
			if ( ! isset( $types[ $id ] ) ) {
				continue;
			}
			$capability = $this->capability_for_type( $types[ $id ] );
			if ( null !== $capability && ! $this->gate->allows( $capability ) ) {
				return false;
			}
		}
		return true;
	}

	/** Paid feature id, or null when the generated definition is Free or unknown.
	 *
	 * @param string $type Element type.
	 */
	private function capability_for_type( string $type ): ?string {
		$definition   = $this->definitions->get( $type );
		$subscription = is_array( $definition['subscription'] ?? null ) ? $definition['subscription'] : [];
		if ( true !== ( $subscription['requiresServerEntitlement'] ?? false ) ) {
			return null;
		}
		$tier = $subscription['minimumTier'] ?? null;
		if ( ! in_array( $tier, [ 'plus', 'pro' ], true ) || ! is_string( $definition['id'] ?? null ) ) {
			return null;
		}
		$namespace = 'plus' === $tier ? 'blixis-plus' : 'blixis-pro';
		return $namespace . '/' . $definition['id'];
	}

	/** Index all safe instance nodes by stable id with their parent and sibling position.
	 *
	 * @param ?\stdClass $layout Layout envelope.
	 * @return array<string,array{type:string,parent:?string,index:int,node:\stdClass}>
	 */
	private static function layout_nodes( ?\stdClass $layout ): array {
		$out = [];
		if ( null === $layout || ! is_array( $layout->root ?? null ) ) {
			return $out;
		}
		$stack = [];
		foreach ( array_reverse( $layout->root ) as $index => $node ) {
			$stack[] = [ $node, null, count( $layout->root ) - $index - 1 ];
		}
		while ( [] !== $stack ) {
			[ $node, $parent, $index ] = array_pop( $stack );
			if ( ! $node instanceof \stdClass || ! is_string( $node->id ?? null ) || ! is_string( $node->type ?? null ) ) {
				continue;
			}
			$out[ $node->id ] = [
				'type'   => $node->type,
				'parent' => $parent,
				'index'  => $index,
				'node'   => $node,
			];
			$children         = is_array( $node->children ?? null ) ? $node->children : [];
			foreach ( array_reverse( $children ) as $child_index => $child ) {
				$stack[] = [ $child, $node->id, count( $children ) - $child_index - 1 ];
			}
		}
		return $out;
	}

	/** Whether a premium node's own persisted fields or placement changed.
	 *
	 * @param string                                                                   $id       Stable node id.
	 * @param array{type:string,parent:?string,index:int,node:\stdClass}               $before   Previous node record.
	 * @param array{type:string,parent:?string,index:int,node:\stdClass}               $after    Submitted node record.
	 * @param array<string,array{type:string,parent:?string,index:int,node:\stdClass}> $previous Previous nodes.
	 * @param array<string,array{type:string,parent:?string,index:int,node:\stdClass}> $current Current nodes.
	 */
	private static function same_layout_node( string $id, array $before, array $after, array $previous, array $current ): bool {
		return $before['type'] === $after['type']
			&& $before['parent'] === $after['parent']
			&& self::same_sibling_order( $id, $before['parent'], $previous, $current )
			&& self::canonical( self::own_fields( $before['node'] ) ) === self::canonical( self::own_fields( $after['node'] ) );
	}

	/** Ignore index shifts from unrelated insertions/deletions while detecting actual sibling reordering.
	 *
	 * @param string                                                                   $id       Stable node id.
	 * @param ?string                                                                  $parent_id Stable parent id.
	 * @param array<string,array{type:string,parent:?string,index:int,node:\stdClass}> $previous Previous nodes.
	 * @param array<string,array{type:string,parent:?string,index:int,node:\stdClass}> $current Current nodes.
	 */
	private static function same_sibling_order( string $id, ?string $parent_id, array $previous, array $current ): bool {
		$before = [];
		$after  = [];
		foreach ( $previous as $sibling_id => $record ) {
			if ( $record['parent'] === $parent_id && isset( $current[ $sibling_id ] ) && $current[ $sibling_id ]['parent'] === $parent_id ) {
				$before[ $sibling_id ] = $record['index'];
			}
		}
		foreach ( $before as $sibling_id => $_index ) {
			$after[ $sibling_id ] = $current[ $sibling_id ]['index'];
		}
		asort( $before, SORT_NUMERIC );
		asort( $after, SORT_NUMERIC );
		return array_keys( $before ) === array_keys( $after ) && isset( $before[ $id ] );
	}

	/** Own fields exclude children because descendant edits are gated by their own nodes.
	 *
	 * @param \stdClass $node Element node.
	 * @return array<string,mixed>
	 */
	private static function own_fields( \stdClass $node ): array {
		$fields = get_object_vars( $node );
		unset( $fields['children'] );
		return $fields;
	}

	/** Return content entries while accepting the older documented stream alias.
	 *
	 * @param ?\stdClass $content Content envelope.
	 * @return array<string,mixed>
	 */
	private static function content_entries( ?\stdClass $content ): array {
		if ( null === $content ) {
			return [];
		}
		$entries = $content->entries ?? $content->translations ?? null;
		return $entries instanceof \stdClass ? get_object_vars( $entries ) : [];
	}

	/** Stable JSON representation for nested objects; list ordering remains meaningful.
	 *
	 * @param mixed $value Candidate.
	 */
	private static function canonical( mixed $value ): string {
		$normalize = static function ( mixed $item ) use ( &$normalize ): mixed {
			if ( $item instanceof \stdClass ) {
				$properties = get_object_vars( $item );
				ksort( $properties, SORT_STRING );
				foreach ( $properties as $key => $child ) {
					$properties[ $key ] = $normalize( $child );
				}
				return $properties;
			}
			if ( is_array( $item ) ) {
				foreach ( $item as $key => $child ) {
					$item[ $key ] = $normalize( $child );
				}
			}
			return $item;
		};
		try {
			return (string) json_encode( $normalize( $value ), JSON_THROW_ON_ERROR ); // phpcs:ignore WordPress.WP.AlternativeFunctions.json_encode_json_encode -- Canonical comparison of validated JSON.
		} catch ( \JsonException $exception ) {
			return '';
		}
	}
}
