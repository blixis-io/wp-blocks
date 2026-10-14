<?php
/**
 * WordPress site locale adapter.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Rest;

\defined( 'ABSPATH' ) || exit;

/** The site locale, never the logged-in user's UI locale. */
final class WordPressSiteLocale implements SiteLocale {
	/** Return the site locale. */
	public function default_locale(): string {
		return \get_locale();
	}
}
