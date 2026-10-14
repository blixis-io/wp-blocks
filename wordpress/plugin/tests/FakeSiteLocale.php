<?php
/**
 * Preview test fixture.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Rest;

/** Test site locale seam. */
final class FakeSiteLocale implements SiteLocale {
	/** Return a stable test locale. */
	public function default_locale(): string {
		return 'en_US';
	}
}
