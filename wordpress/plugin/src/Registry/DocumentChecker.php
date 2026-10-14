<?php
/** Bounded semantic and registry checks.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Registry;

\defined( 'ABSPATH' ) || exit;

/** Reports stable TS issue codes without changing stored unknown data. */
final class DocumentChecker {
	/**
	 * Apply the documented contract.
	 *
	 * @param ElementRegistry $registry Registry.
	 */
	public function __construct( private readonly ElementRegistry $registry ) {}

	/**
	 * Apply the documented contract.
	 *
	 * @param \stdClass $document Document.
	 * @return list<array{code:string,severity:string,path:string,message:string}> Issues.
	 */
	public function check( \stdClass $document ): array {
		$issues = [];
		$add    = static function ( string $code, string $severity, string $path, string $message ) use ( &$issues ): void {
			if ( \count( $issues ) < 50 ) {
				$issues[] = [
					'code'     => $code,
					'severity' => $severity,
					'path'     => $path,
					'message'  => $message,
				];
			}
		};
		$stack  = [];
		foreach ( \array_reverse( \is_array( $document->root ?? null ) ? $document->root : [] ) as $index => $node ) {
			$stack[] = [ $node, null, 1, '$.root[' . ( \count( $document->root ) - $index - 1 ) . ']' ];
		}
		$ids   = [];
		$types = [];
		$count = 0;
		while ( [] !== $stack ) {
			[ $node, $parent, $depth, $path ] = \array_pop( $stack );
			if ( ++$count > 5000 ) {
				$add( 'too-many-nodes', 'error', $path, 'More than 5000 elements.' );
				break;
			}
			if ( $depth > 32 ) {
				$add( 'tree-too-deep', 'error', $path, 'Element tree deeper than 32 levels.' );
				continue;
			}
			if ( ! $node instanceof \stdClass || ! \is_string( $node->id ?? null ) || ! \is_string( $node->type ?? null ) ) {
				continue;
			}
			if ( isset( $ids[ $node->id ] ) ) {
				$add( 'duplicate-element-id', 'error', $path . '.id', 'Element id is already used.' );
			} else {
				$ids[ $node->id ] = $path;
			}
			$types[ $node->id ] = $node->type;
			$def                = $this->registry->get( $node->type );
			if ( null === $def ) {
				$add( 'unknown-element-type', 'warning', $path . '.type', 'Element type is not registered.' );
			} else {
				if ( ! $this->registry->can_nest( $parent, $node->type ) && ( null === $parent || null !== $this->registry->get( $parent ) ) ) {
					$add( 'invalid-nesting', 'error', $path, 'Element is not allowed under this parent.' );
				}
				$props = $node->props ?? new \stdClass();
				if ( $props instanceof \stdClass ) {
					foreach ( \get_object_vars( $props ) as $name => $value ) {
						$definition = $def['props'][ $name ] ?? null;
						if ( null === $definition ) {
							$add( 'unknown-property', 'error', $path . '.props', 'Unknown property.' );
						} elseif ( 'invariant' !== $definition['classification'] ) {
							$add( 'translatable-property-in-props', 'error', $path . '.props', 'Localized property belongs in translations.' );
						} elseif ( ! ElementRegistry::valid_value( $definition, $value ) ) {
							$add( 'invalid-property-value', 'error', $path . '.props', 'Invalid property value.' );
						}
					}
					foreach ( $def['props'] as $name => $definition ) {
						if ( 'invariant' === $definition['classification'] && ( $definition['required'] ?? false ) && ! \property_exists( $props, $name ) ) {
							$add( 'missing-required-property', 'error', $path . '.props', 'Required property is missing.' );
						}
					}
				}
			}
			$rules      = \is_array( $node->style ?? null ) ? $node->style : [];
			$seen_rules = [];
			foreach ( $rules as $i => $rule ) {
				if ( ! $rule instanceof \stdClass ) {
					continue;
				}
				$key = ( $rule->breakpoint ?? '' ) . '|' . ( $rule->mode ?? '' ) . '|' . ( $rule->state ?? '' );
				if ( isset( $seen_rules[ $key ] ) ) {
					$add( 'duplicate-style-rule', 'error', $path . '.style[' . $i . ']', 'Duplicate style rule.' );
				}
				$seen_rules[ $key ] = true;
			}
			foreach ( \array_reverse( \is_array( $node->children ?? null ) ? $node->children : [] ) as $i => $child ) {
				$stack[] = [ $child, $node->type, $depth + 1, $path . '.children[' . ( \count( $node->children ) - $i - 1 ) . ']' ];
			}
		}
		$locales = \is_array( $document->locales ?? null ) ? $document->locales : [];
		if ( \count( $locales ) !== \count( \array_unique( $locales ) ) ) {
			$add( 'duplicate-locale', 'error', '$.locales', 'Duplicate locale.' );
		}
		if ( ! \in_array( $document->{'defaultLocale'} ?? null, $locales, true ) ) {
			$add( 'default-locale-not-listed', 'error', '$.defaultLocale', 'Default locale is not listed.' );
		}
		$translations = $document->translations ?? new \stdClass();
		if ( $translations instanceof \stdClass ) {
			if ( ! \property_exists( $translations, (string) ( $document->{'defaultLocale'} ?? '' ) ) ) {
				$add( 'missing-default-locale-stream', 'error', '$.translations', 'Default locale stream is missing.' );
			}
			foreach ( \get_object_vars( $translations ) as $locale => $stream ) {
				if ( ! \in_array( $locale, $locales, true ) ) {
					$add( 'translation-locale-not-listed', 'error', '$.translations.' . $locale, 'Translation locale is not listed.' );
				}
				if ( ! $stream instanceof \stdClass ) {
					continue;
				}
				foreach ( \get_object_vars( $stream ) as $id => $entry ) {
					if ( ! $entry instanceof \stdClass ) {
						continue;
					}
					if ( ! isset( $ids[ $id ] ) && 'orphaned' !== ( $entry->status ?? null ) ) {
						$add( 'translation-for-missing-element', 'error', '$.translations.' . $locale . '.' . $id, 'Translation element is missing.' );
					} elseif ( isset( $ids[ $id ] ) && 'orphaned' === ( $entry->status ?? null ) ) {
						$add( 'orphaned-entry-for-existing-element', 'warning', '$.translations.' . $locale . '.' . $id, 'Existing element is marked orphaned.' );
					}
					$def = $this->registry->get( $types[ $id ] ?? '' );
					if ( null === $def || ! ( $entry->values ?? null ) instanceof \stdClass ) {
						continue;
					}
					foreach ( \get_object_vars( $entry->values ) as $name => $value ) {
						$prop = $def['props'][ $name ] ?? null;
						if ( null === $prop || 'invariant' === $prop['classification'] ) {
							$add( 'untranslatable-property', 'error', '$.translations.' . $locale . '.' . $id . '.values.' . $name, 'Property is not localizable.' );
						} elseif ( ! ElementRegistry::valid_value( $prop, $value ) ) {
							$add( 'invalid-translation-value', 'error', '$.translations.' . $locale . '.' . $id . '.values.' . $name, 'Invalid translation value.' );
						}
					}
				}
			}
		}
		return $issues;
	}
}
