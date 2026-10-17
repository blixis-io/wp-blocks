<?php
/**
 * Cache invalidation observation for isolated tests.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

/** Captures render-cache invalidation in isolated controller tests. */
class BlixisInvalidationState {
	/** Option writes seen by the fixture.
	 *
	 * @var int
	 */
	public static int $updates = 0;
}
