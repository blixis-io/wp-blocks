<?php
/**
 * WordPress site locale adapter.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Rest;

use Blixis\Builder\Locale\LocaleConfig;

\defined( 'ABSPATH' ) || exit;

/** The site locale, never the logged-in user's UI locale. */
final class WordPressSiteLocale implements SiteLocale {
	/** Return the site locale. */
	public function default_locale(): string {
		// The configured default language (option blixis_locales), else the site locale.
		return LocaleConfig::from_option( \get_option( LocaleConfig::OPTION, false ), \get_locale() )->default_locale;
	}
}
