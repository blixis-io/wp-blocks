<?php
/**
 * A search result: title and excerpt.
 *
 * @package Blixis\Theme
 */

?>
<article id="post-<?php the_ID(); ?>" <?php post_class(); ?>>
	<header class="entry-header">
		<h2 class="entry-title"><a href="<?php echo esc_url( (string) get_permalink() ); ?>" rel="bookmark"><?php the_title(); ?></a></h2>
	</header>
	<div class="entry-summary"><?php the_excerpt(); ?></div>
</article>
