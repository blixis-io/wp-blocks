<?php
/**
 * Per-element translation state of a locale.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Locale;

use Blixis\Builder\Publication\LayoutIndex;
use Blixis\Builder\Registry\ElementRegistry;

\defined( 'ABSPATH' ) || exit;

/**
 * Computes `missing | draft | translated | reviewed | stale | orphaned` for every translatable element (FR-053): a translation
 * is stale when the digest of the default-locale source text no longer equals the `sourceHash` it was made from; text that has
 * no matching element any more is orphaned (kept, never deleted); an element without any translated property is missing.
 * Only translatable properties count as source text, so a per-language link target never makes a translation stale.
 */
final class TranslationStatus {
	/**
	 * Compute the states.
	 *
	 * @param \stdClass       $layout Layout document.
	 * @param \stdClass       $default_entries Default-locale content entries by element id.
	 * @param \stdClass       $target_entries Target-locale content entries by element id.
	 * @param ElementRegistry $registry Element registry.
	 * @return array{elements: array<string, array{state: string, sourceChanged: bool}>, counts: array<string, int>}
	 */
	public static function compute( \stdClass $layout, \stdClass $default_entries, \stdClass $target_entries, ElementRegistry $registry ): array {
		$elements = [];
		$counts   = [];
		$types    = LayoutIndex::types( $layout );
		foreach ( $types as $id => $type ) {
			$ids = self::translatable_ids( $registry, $type );
			if ( [] === $ids ) {
				continue;
			}
			$entry = $target_entries->$id ?? null;
			$state = 'missing';
			$moved = false;
			if ( $entry instanceof \stdClass ) {
				$values = ( $entry->values ?? null ) instanceof \stdClass ? $entry->values : new \stdClass();
				$has    = false;
				foreach ( $ids as $property ) {
					$has = $has || ( \property_exists( $values, $property ) && '' !== $values->$property && null !== $values->$property );
				}
				$stored = \is_string( $entry->status ?? null ) ? $entry->status : 'draft';
				$source = ( $default_entries->$id ?? null ) instanceof \stdClass && ( $default_entries->$id->values ?? null ) instanceof \stdClass ? $default_entries->$id->values : new \stdClass();
				$hash   = $entry->{'sourceHash'} ?? null;
				$moved  = \is_string( $hash ) && SourceDigest::of( $source, $ids ) !== $hash;
				if ( ! $has ) {
					$state = 'missing';
				} elseif ( 'orphaned' === $stored ) {
					$state = 'orphaned';
				} elseif ( $moved ) {
					$state = 'stale';
				} else {
					$state = $stored;
				}
			}
			$elements[ $id ]  = [
				'state'         => $state,
				'sourceChanged' => $moved,
			];
			$counts[ $state ] = ( $counts[ $state ] ?? 0 ) + 1;
		}
		foreach ( \array_keys( \get_object_vars( $target_entries ) ) as $id ) {
			$id = (string) $id;
			if ( ! isset( $types[ $id ] ) ) {
				$elements[ $id ]    = [
					'state'         => 'orphaned',
					'sourceChanged' => false,
				];
				$counts['orphaned'] = ( $counts['orphaned'] ?? 0 ) + 1;
			}
		}
		\ksort( $counts );
		return [
			'elements' => $elements,
			'counts'   => $counts,
		];
	}

	/**
	 * Names of the translatable properties of an element type.
	 *
	 * @param ElementRegistry $registry Element registry.
	 * @param string          $type Element type.
	 * @return list<string>
	 */
	private static function translatable_ids( ElementRegistry $registry, string $type ): array {
		$definition = $registry->get( $type );
		$ids        = [];
		foreach ( \is_array( $definition['props'] ?? null ) ? $definition['props'] : [] as $name => $prop ) {
			if ( \is_array( $prop ) && 'translatable' === ( $prop['classification'] ?? null ) ) {
				$ids[] = (string) $name;
			}
		}
		return $ids;
	}
}
