<?php
/** Inline rich text validation and deterministic server rendering.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Render;

use Blixis\Builder\Registry\SafeUrl;

\defined( 'ABSPATH' ) || exit;

/** Shared bounded validator and renderer for the inline value contract. */
final class RichText {
	public const MAX_NODES      = 5000;
	public const MAX_CHARACTERS = 20000;
	public const MAX_MARKS      = 8;
	public const MAX_HREF       = 2048;
	public const MAX_TOKEN_ID   = 64;

	/**
	 * Check a rich value. Token ids are checked against the supplied allow-list when present.
	 *
	 * @param mixed    $value Candidate.
	 * @param string[] $tokens Optional token ids.
	 * @param string[] $allowed_marks Allowed mark names for this property.
	 */
	public static function valid( mixed $value, array $tokens = [], array $allowed_marks = [] ): bool {
		if ( ! $value instanceof \stdClass || ! self::keys( $value, [ 'v', 'inline' ] ) || ( ! \is_int( $value->v ) && ! \is_float( $value->v ) ) || ( 1 !== $value->v && 1.0 !== $value->v ) || ! \is_array( $value->inline ) || ! \array_is_list( $value->inline ) || \count( $value->inline ) > self::MAX_NODES ) {
			return false;
		}
		$characters = 0;
		foreach ( $value->inline as $node ) {
			if ( ! $node instanceof \stdClass ) {
				return false;
			}
			if ( \property_exists( $node, 't' ) && 'br' === $node->t ) {
				if ( ! self::keys( $node, [ 't' ] ) ) {
					return false;
				}
				continue;
			}
			if ( ! \property_exists( $node, 't' ) || 'text' !== $node->t || ! \property_exists( $node, 's' ) || ! \is_string( $node->s ) || '' === $node->s || [] !== \array_diff( \array_keys( \get_object_vars( $node ) ), [ 't', 's', 'm' ] ) || ! self::valid_text( $node->s ) ) {
				return false;
			}
			$characters += \preg_match_all( '/./us', $node->s );
			if ( $characters > self::MAX_CHARACTERS ) {
				return false;
			}
			if ( \property_exists( $node, 'm' ) && ! \is_array( $node->m ) ) {
				return false; }
			$marks = \property_exists( $node, 'm' ) ? $node->m : [];
			if ( ! \is_array( $marks ) || ! \array_is_list( $marks ) || \count( $marks ) > self::MAX_MARKS ) {
				return false;
			}
			$seen   = [];
			$groups = [];
			foreach ( $marks as $mark ) {
				if ( ! self::valid_mark( $mark, $tokens ) ) {
					return false;
				}
				$name = self::mark_name( $mark );
				if ( [] !== $allowed_marks && ! \in_array( $name, $allowed_marks, true ) ) {
					return false;
				}
				$key = \json_encode( $mark ); // phpcs:ignore WordPress.WP.AlternativeFunctions.json_encode_json_encode -- Pure canonical duplicate detection without WordPress.
				if ( false === $key ) {
					return false;
				}
				if ( isset( $seen[ $key ] ) ) {
					continue;
				}
				if ( 'link' === $name && isset( $groups[ $name ] ) ) {
					return false;
				}
				$seen[ $key ]    = true;
				$groups[ $name ] = true;
			}
		}
		return true;
	}

	/** Render a validated value. Invalid values safely degrade to escaped plain text.
	 *
	 * @param mixed    $value Candidate.
	 * @param bool     $allow_link Whether link marks are permitted in this context.
	 * @param string[] $tokens Active token ids when supplied by the render context.
	 */
	public static function render( mixed $value, bool $allow_link = true, ?array $tokens = null ): string {
		if ( ! self::valid( $value ) ) {
			return Escape::html( self::plain( $value ) );
		}
		return self::render_validated( $value, $allow_link, $tokens );
	}

	/** Render a value already checked by its caller.
	 *
	 * @param \stdClass $value Valid rich value.
	 * @param bool      $allow_link Whether link marks are permitted in this context.
	 * @param ?string[] $tokens Active token ids when supplied by the render context.
	 */
	public static function render_validated( \stdClass $value, bool $allow_link = true, ?array $tokens = null ): string {
		$out = '';
		foreach ( $value->inline as $node ) {
			if ( 'br' === $node->t ) {
				$out .= '<br>';
				continue;
			}
			$marks = \property_exists( $node, 'm' ) ? $node->m : [];
			\usort(
				$marks,
				static function ( mixed $left, mixed $right ): int {
					$order      = [
						'link'   => 0,
						'style'  => 1,
						'strong' => 2,
						'em'     => 3,
						'u'      => 4,
						's'      => 5,
						'code'   => 6,
					];
					$name       = static fn ( mixed $mark ): string => \is_string( $mark ) ? $mark : ( \property_exists( $mark, 'link' ) ? 'link' : 'style' );
					$left_name  = $name( $left );
					$right_name = $name( $right );
					$group      = ( $order[ $left_name ] ?? 99 ) <=> ( $order[ $right_name ] ?? 99 );
					if ( 0 !== $group ) {
						return $group; }
					$left_json  = \json_encode( $left, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES ); // phpcs:ignore WordPress.WP.AlternativeFunctions.json_encode_json_encode -- Canonical mark ordering.
					$right_json = \json_encode( $right, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES ); // phpcs:ignore WordPress.WP.AlternativeFunctions.json_encode_json_encode -- Canonical mark ordering.
					return \strcmp( (string) $left_json, (string) $right_json );
				}
			);
			$text   = Escape::html( $node->s );
			$link   = null;
			$styles = [];
			$tags   = [];
			foreach ( $marks as $mark ) {
				if ( \is_string( $mark ) ) {
					if ( ! \in_array( $mark, $tags, true ) ) {
						$tags[] = $mark;
					}
				} elseif ( \property_exists( $mark, 'link' ) && $allow_link ) {
					$link = $mark->link;
				} elseif ( \property_exists( $mark, 'style' ) ) {
					if ( null !== $tokens && ( ( \property_exists( $mark->style, 'color' ) && ! \in_array( $mark->style->color, $tokens, true ) ) || ( \property_exists( $mark->style, 'highlight' ) && ! \in_array( $mark->style->highlight, $tokens, true ) ) ) ) {
						continue; }
					foreach ( [
						'color'     => 'blx-mc-',
						'highlight' => 'blx-mh-',
						'weight'    => 'blx-mw-',
					] as $key => $prefix ) {
						if ( \property_exists( $mark->style, $key ) ) {
							$styles[] = $prefix . $mark->style->$key;
						}
					}
				}
			}
			if ( [] !== $styles ) {
				$text = '<span class="' . Escape::attr( \implode( ' ', \array_unique( $styles ) ) ) . '">' . $text . '</span>';
			}
			foreach ( [ 'code', 's', 'u', 'em', 'strong' ] as $tag ) {
				if ( \in_array( $tag, $tags, true ) ) {
					$text = '<' . $tag . '>' . $text . '</' . $tag . '>';
				}
			}
			if ( null !== $link ) {
				$target = ( $link->{'newTab'} ?? false ) ? ' target="_blank" rel="noopener noreferrer"' : ''; // phpcs:ignore WordPress.NamingConventions.ValidVariableName.UsedPropertyNotSnakeCase -- JSON contract uses camelCase.
				$text   = '<a href="' . Escape::url( $link->href ) . '"' . $target . '>' . $text . '</a>';
			}
			$out .= $text;
		}
		return $out;
	}

	/** Plain text fallback for an invalid/untrusted value.
	 *
	 * @param mixed $value Candidate.
	 */
	public static function plain( mixed $value ): string {
		if ( \is_string( $value ) ) {
			return $value;
		}
		if ( $value instanceof \stdClass && \is_array( $value->inline ?? null ) ) {
			$out = '';
			foreach ( $value->inline as $node ) {
				if ( $node instanceof \stdClass && 'text' === ( $node->t ?? null ) && \is_string( $node->s ?? null ) ) {
					$out .= $node->s;
				} elseif ( $node instanceof \stdClass && 'br' === ( $node->t ?? null ) ) {
					$out .= "\n";
				}
			}
			return $out;
		}
		return '';
	}

	/** Check UTF-8 and reject controls other than newline.
	 *
	 * @param string $text Text.
	 */
	private static function valid_text( string $text ): bool {
		return 1 === \preg_match( '//u', $text ) && 1 !== \preg_match( '/[\x00-\x1F\x7F-\x9F]/u', $text );
	}

	/** Read the semantic mark name.
	 *
	 * @param mixed $mark Mark.
	 */
	private static function mark_name( mixed $mark ): string {
		if ( \is_string( $mark ) ) {
			return $mark;
		}
		return \property_exists( $mark, 'link' ) ? 'link' : 'style';
	}

	/** Check a mark and its token reference.
	 *
	 * @param mixed    $mark Mark.
	 * @param string[] $tokens Token ids.
	 */
	private static function valid_mark( mixed $mark, array $tokens ): bool {
		if ( \is_string( $mark ) ) {
			return \in_array( $mark, [ 'strong', 'em', 'u', 's', 'code' ], true );
		}
		if ( ! $mark instanceof \stdClass || 1 !== \count( \get_object_vars( $mark ) ) ) {
			return false;
		}
		if ( \property_exists( $mark, 'link' ) ) {
			$link = $mark->link;
			return $link instanceof \stdClass && [] === \array_diff( \array_keys( \get_object_vars( $link ) ), [ 'href', 'newTab' ] ) && \property_exists( $link, 'href' ) && \is_string( $link->href ) && '' !== $link->href && SafeUrl::utf16_length( $link->href ) <= self::MAX_HREF && SafeUrl::accepts( $link->href ) && ( ! \property_exists( $link, 'newTab' ) || \is_bool( $link->{'newTab'} ) ); // phpcs:ignore WordPress.NamingConventions.ValidVariableName.UsedPropertyNotSnakeCase -- JSON contract uses camelCase.
		}
		if ( ! \property_exists( $mark, 'style' ) || ! $mark->style instanceof \stdClass ) {
			return false;
		}
		$style = $mark->style;
		$keys  = \array_keys( \get_object_vars( $style ) );
		if ( [] !== \array_diff( $keys, [ 'color', 'highlight', 'weight' ] ) || [] === $keys ) {
			return false;
		}
		foreach ( [ 'color', 'highlight' ] as $key ) {
			if ( \property_exists( $style, $key ) && ( ! \is_string( $style->$key ) || \strlen( $style->$key ) > self::MAX_TOKEN_ID || 1 !== \preg_match( '/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/D', $style->$key ) || ( [] !== $tokens && ! \in_array( $style->$key, $tokens, true ) ) ) ) {
				return false;
			}
		}
		return ! \property_exists( $style, 'weight' ) || \in_array( $style->weight, [ 'normal', 'medium', 'bold' ], true );
	}

	/** Check an exact object key set.
	 *
	 * @param \stdClass $value Object.
	 * @param string[]  $required Required keys.
	 */
	private static function keys( \stdClass $value, array $required ): bool {
		$keys = \array_keys( \get_object_vars( $value ) );
		return [] === \array_diff( $keys, $required ) && [] === \array_diff( $required, $keys );
	}
}
