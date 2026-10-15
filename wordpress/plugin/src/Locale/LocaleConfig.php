<?php
/**
 * Site languages for native locale routing.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Locale;

use Blixis\Builder\Storage\MetaKeys;

\defined( 'ABSPATH' ) || exit;

/**
 * The versioned option `blixis_locales`: `{ "version": 1, "defaultLocale": "en_US", "enabledLocales": ["en_US", "nl_NL"],
 * "fallback": "source" }`. Parsing never throws: anything invalid yields a single-language site, which disables routing.
 */
final class LocaleConfig {
	public const OPTION      = 'blixis_locales';
	public const MAX_LOCALES = 20;
	public const FALLBACKS   = [ 'source', 'blank' ];

	/**
	 * Create a configuration.
	 *
	 * @param string        $default_locale Default locale (served at the canonical URLs).
	 * @param array<string> $enabled Enabled locales, default first.
	 * @param string        $fallback Missing-translation policy: `source` or `blank`.
	 */
	public function __construct( public readonly string $default_locale, public readonly array $enabled, public readonly string $fallback = 'source' ) {}

	/**
	 * Parse the stored option.
	 *
	 * @param mixed  $value Stored value.
	 * @param string $site_default Locale to use when the option has no valid default.
	 * @return self
	 */
	public static function from_option( mixed $value, string $site_default ): self {
		$site_default = MetaKeys::is_valid_locale( $site_default ) ? $site_default : 'en_US';
		if ( ! \is_array( $value ) || 1 !== ( $value['version'] ?? null ) ) {
			return new self( $site_default, [ $site_default ] );
		}
		$default_locale = \is_string( $value['defaultLocale'] ?? null ) && MetaKeys::is_valid_locale( $value['defaultLocale'] ) ? $value['defaultLocale'] : $site_default;
		$enabled        = [ $default_locale ];
		foreach ( \is_array( $value['enabledLocales'] ?? null ) ? $value['enabledLocales'] : [] as $locale ) {
			if ( \is_string( $locale ) && MetaKeys::is_valid_locale( $locale ) && ! \in_array( $locale, $enabled, true ) && \count( $enabled ) < self::MAX_LOCALES ) {
				$enabled[] = $locale;
			}
		}
		$fallback = \in_array( $value['fallback'] ?? null, self::FALLBACKS, true ) ? $value['fallback'] : 'source';
		return new self( $default_locale, $enabled, $fallback );
	}

	/**
	 * Whether more than one language is enabled.
	 *
	 * @return bool
	 */
	public function is_multilingual(): bool {
		return \count( $this->enabled ) > 1;
	}

	/**
	 * URL prefix of every enabled non-default locale. The language subtag (`nl`) when it is unique, the whole tag
	 * (`nl-be`) when two enabled locales share a language.
	 *
	 * @return array<string, string> Locale to prefix.
	 */
	public function prefixes(): array {
		$languages = [];
		foreach ( $this->enabled as $locale ) {
			$language               = \strtolower( \explode( '_', $locale )[0] );
			$languages[ $language ] = ( $languages[ $language ] ?? 0 ) + 1;
		}
		$prefixes = [];
		foreach ( $this->enabled as $locale ) {
			if ( $locale === $this->default_locale ) {
				continue;
			}
			$language            = \strtolower( \explode( '_', $locale )[0] );
			$prefixes[ $locale ] = ( $languages[ $language ] ?? 0 ) > 1 ? \strtolower( \str_replace( '_', '-', $locale ) ) : $language;
		}
		return $prefixes;
	}

	/**
	 * The locale a URL prefix belongs to.
	 *
	 * @param string $prefix First path segment.
	 * @return ?string
	 */
	public function locale_for_prefix( string $prefix ): ?string {
		$locale = \array_search( $prefix, $this->prefixes(), true );
		return false === $locale ? null : (string) $locale;
	}

	/**
	 * BCP 47 tag of a locale (`nl_NL` to `nl-NL`).
	 *
	 * @param string $locale WordPress locale.
	 * @return string
	 */
	public static function tag( string $locale ): string {
		return \str_replace( '_', '-', $locale );
	}
}
