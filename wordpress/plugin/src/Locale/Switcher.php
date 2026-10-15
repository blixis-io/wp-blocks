<?php
/**
 * Language switcher markup.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Locale;

\defined( 'ABSPATH' ) || exit;

/** Links to the published translations of the current page; unpublished locales are omitted (ADR 0006). */
final class Switcher {
	/**
	 * Self-name of a locale, such as `Nederlands`.
	 *
	 * @param string $locale WordPress locale.
	 * @return string
	 */
	public static function label( string $locale ): string {
		$tag = LocaleConfig::tag( $locale );
		if ( \class_exists( \Locale::class ) ) {
			$name = \Locale::getDisplayName( $tag, $tag );
			if ( \is_string( $name ) && '' !== $name && $name !== $tag ) {
				return \mb_strtoupper( \mb_substr( $name, 0, 1 ) ) . \mb_substr( $name, 1 );
			}
		}
		return $tag;
	}

	/**
	 * Markup of the switcher for a page.
	 *
	 * @param array<string, string> $urls Published locale to absolute URL.
	 * @param string                $current Current locale.
	 * @param string                $name Accessible name of the navigation.
	 * @return string Empty when there is nothing to switch to.
	 */
	public static function html( array $urls, string $current, string $name ): string {
		if ( \count( $urls ) < 2 ) {
			return '';
		}
		$items = '';
		foreach ( $urls as $locale => $url ) {
			$tag    = LocaleConfig::tag( $locale );
			$items .= '<li><a href="' . \esc_url( $url ) . '" hreflang="' . \esc_attr( $tag ) . '" lang="' . \esc_attr( $tag ) . '"' . ( $locale === $current ? ' aria-current="page"' : '' ) . '>' . \esc_html( self::label( $locale ) ) . '</a></li>';
		}
		return '<nav class="blx-locale-switcher" aria-label="' . \esc_attr( $name ) . '"><ul>' . $items . '</ul></nav>';
	}
}
