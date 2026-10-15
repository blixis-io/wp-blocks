<?php
/**
 * Safe design token CSS for the isolated canvas.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Canvas;

\defined( 'ABSPATH' ) || exit;

/** Converts stored design system token data to bounded CSS declarations. */
final class TokenCss {
	private const SAFE_VALUE = '/^[A-Za-z0-9#%.,()\/ \'"\-]{1,200}$/';

	/**
	 * Render light and dark token declarations, ignoring invalid tokens.
	 *
	 * @param mixed $value Saved option or token map.
	 */
	public static function from_option( mixed $value ): string {
		$tokens = \is_array( $value ) && \is_array( $value['tokens'] ?? null ) ? $value['tokens'] : $value;
		if ( ! \is_array( $tokens ) ) {
			return '';
		}
		\ksort( $tokens );
		$light = '';
		$dark  = '';
		foreach ( $tokens as $name => $token ) {
			if ( ! \is_string( $name ) || 1 !== \preg_match( '/^[a-z0-9]+(?:-[a-z0-9]+)*$/D', $name ) || ! \is_array( $token ) || ! self::safe_value( $token['value'] ?? null ) ) {
				continue;
			}
			$light .= '--blx-' . $name . ':' . $token['value'] . ';';
			if ( \is_string( $token['dark'] ?? null ) && $token['dark'] !== $token['value'] && self::safe_value( $token['dark'] ) ) {
				$dark .= '--blx-' . $name . ':' . $token['dark'] . ';';
			}
		}
		if ( '' === $light ) {
			return '';
		}
		$light = \rtrim( $light, ';' );
		$css   = ':where(:root){' . $light . '}:where(#blx-canvas-root[data-blx-mode="light"]){' . $light . '}';
		if ( '' !== $dark ) {
			$dark = \rtrim( $dark, ';' );
			$rule = '{' . $dark . '}';
			$css .= ':where(html[data-theme="dark"])' . $rule . '@media (prefers-color-scheme:dark){:where(html:not([data-theme="light"]):not([data-theme="dark"]))' . $rule . '}';
			$css .= ':where(#blx-canvas-root[data-blx-mode="dark"])' . $rule;
		}
		return '@layer blx.tokens{' . $css . '}';
	}

	/**
	 * Apply the theme's output character rule and explicitly refuse URL constructors.
	 *
	 * @param mixed $value Candidate token value.
	 * @return bool
	 */
	private static function safe_value( mixed $value ): bool {
		return \is_string( $value ) && 1 === \preg_match( self::SAFE_VALUE, $value ) && 1 !== \preg_match( '/url\s*\(/i', $value );
	}
}
