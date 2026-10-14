<?php
/**
 * Site locale boundary.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Rest;

\defined( 'ABSPATH' ) || exit;

/** Keeps the website content locale independent of the user's interface locale. */
interface SiteLocale {
	/** Return the configured site locale. */
	public function default_locale(): string;
}
