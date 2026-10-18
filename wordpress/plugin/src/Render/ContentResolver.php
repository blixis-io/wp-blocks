<?php
/** Locale-aware property selection.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Render;

use Blixis\Builder\Registry\ElementRegistry;
use Blixis\Builder\Registry\ElementDefinitionRegistry;

\defined( 'ABSPATH' ) || exit;

/** Selects only values admitted by their manifest property definition. */
final class ContentResolver {
	/** Definition-driven property aliases for v2 documents.
	 *
	 * @var ElementDefinitionRegistry
	 */
	private readonly ElementDefinitionRegistry $definitions;
	/**
	 * Apply the documented contract.
	 *
	 * @param ElementRegistry $registry Registry.
	 */
	public function __construct( private readonly ElementRegistry $registry ) {
		$this->definitions = ElementDefinitionRegistry::from_manifest_file( \dirname( __DIR__, 2 ) . '/data/element-definitions-v2.json' );
	}

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
			$definition_name = $this->definitions->canonical_property( (string) ( $node->type ?? '' ), (string) $name );
			$candidate_names = \array_unique( [ $name, $definition_name, ...$this->definitions->legacy_aliases( (string) ( $node->type ?? '' ), $definition_name ) ] );
			$candidates      = [];
			if ( 'invariant' === $prop['classification'] ) {
				if ( ( $node->props ?? null ) instanceof \stdClass ) {
					foreach ( $candidate_names as $candidate_name ) {
						if ( \property_exists( $node->props, $candidate_name ) ) {
							$candidates[] = $node->props->$candidate_name;
							break;
						}
					}
				}
			} else {
				// Fallback policy `source` (default) falls back to the default locale's text; `blank` shows nothing for a missing translation.
				foreach ( 'blank' === $fallback ? [ $locale ] : \array_unique( [ $locale, (string) ( $document->{'defaultLocale'} ?? '' ) ] ) as $stream_locale ) {
					$stream = ( $document->translations ?? null ) instanceof \stdClass ? ( $document->translations->$stream_locale ?? null ) : null;
					$entry  = $stream instanceof \stdClass ? ( $stream->{$node->id} ?? null ) : null;
					if ( $entry instanceof \stdClass && ( $entry->values ?? null ) instanceof \stdClass ) {
						foreach ( $candidate_names as $candidate_name ) {
							if ( \property_exists( $entry->values, $candidate_name ) && ( $candidate_name === $name || $this->definitions->localizable( (string) ( $node->type ?? '' ), $definition_name ) ) ) {
								$candidates[] = $entry->values->$candidate_name;
								break;
							}
						}
					}
				}
			}
			if ( 'blank' === $fallback && 'invariant' !== $prop['classification'] && \in_array( $prop['kind'] ?? '', [ 'string', 'text' ], true ) ) {
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
			$degraded = null;
			foreach ( $candidates as $value ) {
				if ( 'invariant' !== $prop['classification'] && '' === $value ) {
					continue;
				}
				if ( 'text' === ( $prop['kind'] ?? '' ) && $value instanceof \stdClass && ! ElementRegistry::valid_value( $prop, $value ) ) {
					$plain = RichText::plain( $value );
					if ( '' !== $plain ) {
						$degraded = self::truncate( $plain, (int) $prop['maxLength'] );
					}
					continue;
				}
				if ( ElementRegistry::valid_value( $prop, $value ) ) {
					$out[ $name ] = $value;
					break;
				}
			}
			if ( ! \array_key_exists( $name, $out ) && null !== $degraded ) {
				$out[ $name ] = $degraded;
			}
			if ( ! \array_key_exists( $name, $out ) && \array_key_exists( 'default', $prop ) && ( 'invariant' === $prop['classification'] || '' !== $prop['default'] ) && ElementRegistry::valid_value( $prop, $prop['default'] ) ) {
				$out[ $name ] = $prop['default'];
			}
		}
		return $out;
	}

	/** UTF-8 safe truncation by Unicode character count.
	 *
	 * @param string $value Text to truncate.
	 * @param int    $limit Maximum number of Unicode characters.
	 */
	private static function truncate( string $value, int $limit ): string {
		if ( \function_exists( 'mb_substr' ) ) {
			return (string) \mb_substr( $value, 0, $limit, 'UTF-8' ); }
		$matched = \preg_match_all( '/./us', $value, $characters );
		return false === $matched ? '' : \implode( '', \array_slice( $characters[0], 0, $limit ) );
	}
}
