<?php
/**
 * Whether locale content still fits a layout (ADR 0004 section 3).
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Publication;

use Blixis\Builder\Registry\ElementRegistry;
use Blixis\Builder\Registry\ElementDefinitionRegistry;

\defined( 'ABSPATH' ) || exit;

/** Content entries must refer to elements that exist with the same type, and only to translatable properties. */
final class Compatibility {
	/**
	 * Problems of content entries against a layout.
	 *
	 * @param \stdClass             $entries Content entries by element id.
	 * @param array<string, string> $recorded_types Element id to the type the entry was written against.
	 * @param array<string, string> $layout_types Element id to type in the layout.
	 * @param ElementRegistry       $registry Element registry.
	 * @return list<array{id: string, reason: string}>
	 */
	public static function problems( \stdClass $entries, array $recorded_types, array $layout_types, ElementRegistry $registry ): array {
		$problems    = [];
		$definitions = ElementDefinitionRegistry::from_manifest_file( \dirname( __DIR__, 2 ) . '/data/element-definitions-v2.json' );
		foreach ( \get_object_vars( $entries ) as $id => $entry ) {
			$id   = (string) $id;
			$type = $layout_types[ $id ] ?? null;
			if ( null === $type ) {
				$problems[] = [
					'id'     => $id,
					'reason' => 'missing-element',
				];
				continue;
			}
			if ( isset( $recorded_types[ $id ] ) && $recorded_types[ $id ] !== $type ) {
				$problems[] = [
					'id'     => $id,
					'reason' => 'type-changed',
				];
				continue;
			}
			$definition = $registry->get( $type );
			$values     = $entry instanceof \stdClass && ( $entry->values ?? null ) instanceof \stdClass ? \get_object_vars( $entry->values ) : [];
			foreach ( \array_keys( $values ) as $property ) {
				$classification      = $definition['props'][ $property ]['classification'] ?? null;
				$definition_property = $definitions->property( $type, (string) $property );
				$allowed             = \in_array( $classification, [ 'translatable', 'locale-specific' ], true ) || ( \is_array( $definition_property ) && true === ( $definition_property['localizable'] ?? false ) );
				if ( ! $allowed ) {
					$problems[] = [
						'id'     => $id,
						'reason' => 'not-translatable',
					];
					break;
				}
			}
		}
		return $problems;
	}
}
