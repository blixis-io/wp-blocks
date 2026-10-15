<?php
/** Locale-aware property selection.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Render;

use Blixis\Builder\Registry\ElementRegistry;

\defined( 'ABSPATH' ) || exit;

/** Selects only values admitted by their manifest property definition. */
final class ContentResolver {
	/**
	 * Apply the documented contract.
	 *
	 * @param ElementRegistry $registry Registry.
	 */
	public function __construct( private readonly ElementRegistry $registry ) {}

	/**
	 * Apply the documented contract.
	 *
	 * @param \stdClass $node Node.
	 * @param \stdClass $document Document.
	 * @param string    $locale Locale.
	 * @param string    $fallback Missing-translation policy: `source` or `blank`.
	 * @return array<string, mixed>
	 */
	public function values( \stdClass $node, \stdClass $document, string $locale, string $fallback = 'source' ): array {
		$definition = $this->registry->get( (string) ( $node->type ?? '' ) );
		if ( null === $definition ) {
			return [];
		}
		$out = [];
		foreach ( $definition['props'] as $name => $prop ) {
			$candidates = [];
			if ( 'invariant' === $prop['classification'] ) {
				if ( ( $node->props ?? null ) instanceof \stdClass && \property_exists( $node->props, $name ) ) {
					$candidates[] = $node->props->$name;
				}
			} else {
				// Fallback policy `source` (default) falls back to the default locale's text; `blank` shows nothing for a missing translation.
				foreach ( 'blank' === $fallback ? [ $locale ] : \array_unique( [ $locale, (string) ( $document->{'defaultLocale'} ?? '' ) ] ) as $stream_locale ) {
					$stream = ( $document->translations ?? null ) instanceof \stdClass ? ( $document->translations->$stream_locale ?? null ) : null;
					$entry  = $stream instanceof \stdClass ? ( $stream->{$node->id} ?? null ) : null;
					if ( $entry instanceof \stdClass && ( $entry->values ?? null ) instanceof \stdClass && \property_exists( $entry->values, $name ) ) {
						$candidates[] = $entry->values->$name;
					}
				}
			}
			if ( 'blank' === $fallback && 'invariant' !== $prop['classification'] && 'string' === ( $prop['kind'] ?? '' ) ) {
				$out[ $name ] = '';
				// A present translation (already in $candidates) still wins below.
				foreach ( $candidates as $value ) {
					if ( '' !== $value && ElementRegistry::valid_value( $prop, $value ) ) {
						$out[ $name ] = $value;
						break;
					}
				}
				continue;
			}
			if ( \array_key_exists( 'default', $prop ) ) {
				$candidates[] = $prop['default'];
			}
			foreach ( $candidates as $value ) {
				if ( 'invariant' !== $prop['classification'] && '' === $value ) {
					continue;
				}
				if ( ElementRegistry::valid_value( $prop, $value ) ) {
					$out[ $name ] = $value;
					break;
				}
			}
		}
		return $out;
	}
}
